import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { ReviewStackParamList } from "../../types/navigation";
import { generateReview } from "../../services/claude";
import { createReview, linkInterviewToReview } from "../../services/review";
import { saveUnsavedReview } from "../../utils/storage";
import { markGuestInterviewUsed, saveGuestPendingReview } from "../../utils/guestStorage";
import { resolveLlmLanguage } from "../../utils/llmLanguage";
import { CATEGORY_ICONS } from "../../components/common/CategoryChip";
import { GuestSignInDialog } from "../../components/common/GuestSignInDialog";
import { useAuthStore } from "../../stores/authStore";
import { useGuestStore } from "../../stores/guestStore";

type Nav = NativeStackNavigationProp<ReviewStackParamList, "ReviewComplete">;
type Route = RouteProp<ReviewStackParamList, "ReviewComplete">;

export function ReviewCompleteScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const user = useAuthStore((s) => s.user);
  const isGuest = useGuestStore((s) => s.isGuest);
  const guestPendingWork = useGuestStore((s) => s.pendingWork);
  const setGuestInterviewUsed = useGuestStore((s) => s.setInterviewUsed);
  const setHasPendingReview = useGuestStore((s) => s.setHasPendingReview);

  const { content, conversation, interviewId, initialReview } = route.params;

  const [reviewText, setReviewText] = useState(initialReview?.reviewText ?? "");
  const [reviewTitle, setReviewTitle] = useState(initialReview?.suggestedTitle ?? "");
  const [isGenerating, setIsGenerating] = useState(!initialReview);
  const [isSaving, setIsSaving] = useState(false);
  const [generateError, setGenerateError] = useState(false);
  const [generateErrorMessage, setGenerateErrorMessage] = useState<string | null>(null);
  // saved: 서버 저장 성공 / queued: 실패해 로컬 보관 (연결 시 syncUnsavedReviews 가 업로드)
  const [saveResult, setSaveResult] = useState<"saved" | "queued" | null>(null);
  // 게스트가 '저장하기'를 눌렀을 때의 로그인 유도 모달
  const [showGuestSaveDialog, setShowGuestSaveDialog] = useState(false);

  useEffect(() => {
    // 미리보기에서 이미 생성한 평론을 받았으면 재생성(LLM 재호출)하지 않는다
    if (!initialReview) handleGenerate();
    if (isGuest && initialReview) {
      consumeGuestTrial();
      void persistGuestReview(initialReview.suggestedTitle, initialReview.reviewText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 게스트 체험 1회를 소진 처리한다. 인터뷰 완료가 아니라 "평론이 실제로 생성된"
  // 시점에 건다 — 생성이 실패했는데 체험만 날아가면 아무것도 못 본 채로 막히기 때문.
  const consumeGuestTrial = () => {
    if (!isGuest) return;
    setGuestInterviewUsed(true);
    markGuestInterviewUsed().catch(() => {});
  };

  // 게스트가 만든 평론을 로컬에 보관한다. '저장하기'를 누르지 않고 화면을 벗어나도
  // 애써 만든 평론이 사라지지 않도록 생성 직후와 저장 시도 시점 모두에서 기록한다.
  const persistGuestReview = async (title: string, body: string) => {
    if (!isGuest || !guestPendingWork || !body.trim()) return;
    try {
      await saveGuestPendingReview({
        work: guestPendingWork,
        conversation,
        title: title || null,
        body,
        savedAt: new Date().toISOString(),
      });
      setHasPendingReview(true);
    } catch (e) {
      console.error("saveGuestPendingReview failed:", e);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateError(false);
    setGenerateErrorMessage(null);
    try {
      const result = await generateReview({
        content: {
          title: content.title,
          category: content.category,
          creator: content.creator,
          year: content.year,
          genre: content.genre,
        },
        conversation_history: conversation,
        // 게스트는 계정(users.language)이 없어 기기 언어를 따른다 — utils/llmLanguage.ts
        language: resolveLlmLanguage(user),
        // 같은 인터뷰의 재생성은 사용량을 추가 차감하지 않도록 서버에 전달
        interview_id: interviewId || null,
      });
      if (result) {
        setReviewText(result.review_text);
        setReviewTitle(result.suggested_title);
        consumeGuestTrial();
        void persistGuestReview(result.suggested_title, result.review_text);
      } else {
        setGenerateError(true);
      }
    } catch (e) {
      // 서버 한도 초과(limit_exceeded) 등의 메시지는 그대로 노출
      setGenerateErrorMessage(e instanceof Error && e.message ? e.message : null);
      setGenerateError(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!reviewText.trim()) return;

    // 게스트: 저장은 계정 기반 행위다. 편집분까지 로컬에 보관한 뒤 회원가입을 안내한다.
    // 가입이 완료되면 useAuth → migrateGuestReview 가 이 평론을 새 계정으로 옮긴다.
    if (isGuest) {
      await persistGuestReview(reviewTitle, reviewText);
      setShowGuestSaveDialog(true);
      return;
    }

    if (!user) return;
    setIsSaving(true);
    try {
      const review = await createReview({
        userId: user.id,
        workId: content.id,
        title: reviewTitle || null,
        body: reviewText,
        experienceDate: null,
      });

      if (interviewId) {
        await linkInterviewToReview(interviewId, review.id);
      }

      setSaveResult("saved");
      setTimeout(() => navigation.popToTop(), 1500);
    } catch {
      // 서버 저장 실패 — 로컬 보관 후 연결되면 syncUnsavedReviews 가 자동 업로드
      await saveUnsavedReview({
        userId: user.id,
        contentId: content.id,
        title: reviewTitle || null,
        body: reviewText,
        experienceDate: null,
        interviewId,
        savedAt: new Date().toISOString(),
      });
      setSaveResult("queued");
      // 임시 저장 안내는 읽을 시간을 조금 더 준다
      setTimeout(() => navigation.popToTop(), 2200);
    } finally {
      setIsSaving(false);
    }
  };

  // Loading state
  if (isGenerating) {
    return (
      <SafeAreaView className="flex-1 bg-surface justify-center items-center">
        <ActivityIndicator size="large" color="#6366F1" />
        <Text className="text-text-secondary text-base mt-4">
          {t("review.complete.generating")}
        </Text>
      </SafeAreaView>
    );
  }

  // Error state
  if (generateError) {
    return (
      <SafeAreaView className="flex-1 bg-surface justify-center items-center px-6">
        <Text className="text-text-secondary text-base text-center mb-4">
          {generateErrorMessage ?? t("review.complete.generateFailed")}
        </Text>
        <View className="flex-row gap-3">
          <Pressable
            className="bg-primary rounded-xl px-6 py-3"
            onPress={handleGenerate}
          >
            <Text className="text-white font-medium">{t("review.complete.regenerate")}</Text>
          </Pressable>
          {/* Interview 는 replace 로 스택에서 제거된 상태라 goBack 하면 작품 확인 화면으로
              떨어진다(드래프트도 이미 삭제됨) — 홈으로 보내는 게 정직한 동작 */}
          <Pressable
            className="bg-surface-tertiary rounded-xl px-6 py-3"
            onPress={() => navigation.popToTop()}
          >
            <Text className="text-text font-medium">{t("review.complete.goHome")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Save result toast — 서버 저장(saved)과 로컬 임시 저장(queued)을 구분해 안내
  if (saveResult) {
    return (
      <SafeAreaView className="flex-1 bg-surface justify-center items-center px-8">
        {saveResult === "saved" ? (
          <View className="bg-success/10 rounded-2xl p-8 items-center">
            <Text className="text-success text-4xl mb-4">✓</Text>
            <Text className="text-text text-lg font-semibold">{t("review.complete.saved")}</Text>
          </View>
        ) : (
          <View className="bg-surface-tertiary rounded-2xl p-8 items-center">
            <Text className="text-4xl mb-4">☁️</Text>
            <Text className="text-text text-lg font-semibold mb-2">{t("review.complete.queued")}</Text>
            <Text className="text-text-secondary text-[15px] text-center">
              {t("review.complete.queuedDesc")}
            </Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView className="flex-1 px-6 pt-6" contentContainerClassName="pb-8">
        {/* Header */}
        <View className="flex-row items-center mb-6">
          <Text className="text-lg mr-2">{CATEGORY_ICONS[content.category]}</Text>
          <Text className="text-text font-semibold text-base flex-1" numberOfLines={1}>
            {content.title}
          </Text>
          <Text className="text-text-secondary text-[15px]">{t("review.complete.title")}</Text>
        </View>

        {/* Review title */}
        <TextInput
          className="text-text text-xl font-bold mb-4"
          value={reviewTitle}
          onChangeText={setReviewTitle}
          placeholder={t("review.complete.titlePlaceholder")}
          placeholderTextColor="#94A3B8"
        />

        {/* Review body */}
        <TextInput
          className="text-text text-base leading-7 min-h-[300px]"
          value={reviewText}
          onChangeText={setReviewText}
          multiline
          textAlignVertical="top"
        />

        {/* Character count */}
        <Text className="text-text-tertiary text-[13px] text-right mt-2">
          {reviewText.length}
        </Text>
      </ScrollView>

      {/* Bottom buttons */}
      <View className="px-6 pb-6 flex-row gap-3">
        <Pressable
          className="flex-1 bg-surface-tertiary rounded-xl py-4 items-center"
          onPress={handleGenerate}
          disabled={isGenerating}
        >
          <Text className="text-text font-semibold text-base">
            {t("review.complete.regenerate")}
          </Text>
        </Pressable>
        <Pressable
          className={`flex-1 rounded-xl py-4 items-center ${
            reviewText.trim() && !isSaving ? "bg-primary" : "bg-primary/40"
          }`}
          onPress={handleSave}
          disabled={!reviewText.trim() || isSaving}
        >
          <Text className="text-white font-semibold text-base">
            {isSaving ? "..." : t("review.complete.save")}
          </Text>
        </Pressable>
      </View>

      {/* 게스트 저장 유도 — "가입 = 저장(계정 기반 기능)"임을 화면 안에서 보여주는 자리 */}
      <GuestSignInDialog
        visible={showGuestSaveDialog}
        title={t("guest.saveTitle")}
        message={t("guest.saveMessage")}
        onClose={() => setShowGuestSaveDialog(false)}
      />
    </SafeAreaView>
  );
}

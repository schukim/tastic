import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import Animated, {
  FadeInDown,
  SlideInRight,
  FadeIn,
} from "react-native-reanimated";
import type { ReviewStackParamList } from "../../types/navigation";
import type { ConversationEntry } from "../../types/database";
import { QuestionCard } from "../../components/common/QuestionCard";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { CATEGORY_ICONS } from "../../components/common/CategoryChip";
import { useInterview } from "../../hooks/useInterview";
import { loadDraft, clearDraft } from "../../utils/storage";
import { generateReview } from "../../services/claude";
import { useAuthStore } from "../../stores/authStore";

type Nav = NativeStackNavigationProp<ReviewStackParamList, "Interview">;
type Route = RouteProp<ReviewStackParamList, "Interview">;

export function InterviewScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const user = useAuthStore((s) => s.user);
  const { content } = route.params;

  const {
    conversation,
    questionCount,
    currentQuestion,
    isLoading,
    error,
    canPreview,
    interviewId,
    initInterview,
    fetchQuestion,
    submitAnswer,
    finishInterview,
    restoreFromDraft,
    setError,
  } = useInterview(content);

  const [answerText, setAnswerText] = useState("");
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [initialized, setInitialized] = useState(false);

  // Initialize
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    (async () => {
      // Check for draft
      const draft = await loadDraft();
      if (draft && draft.content.id === content.id) {
        restoreFromDraft(draft.conversation, draft.questionCount, draft.interviewId);
        // If last entry is a user answer, fetch next question
        const lastEntry = draft.conversation[draft.conversation.length - 1];
        if (lastEntry?.role === "user") {
          fetchQuestion(draft.conversation, draft.questionCount);
        }
      } else {
        await initInterview();
        fetchQuestion([], 0);
      }
    })();
  }, [initialized, content.id, initInterview, fetchQuestion, restoreFromDraft]);

  const handleSubmitAnswer = async () => {
    if (!answerText.trim()) return;
    const text = answerText.trim();
    setAnswerText("");
    await submitAnswer(text);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handlePreview = async () => {
    setShowPreview(true);
    setPreviewLoading(true);
    try {
      const result = await generateReview({
        content: {
          title: content.title,
          category: content.category,
          creator: content.creator,
          year: content.year,
        },
        conversation_history: conversation,
        language: user?.language ?? "ko",
      });
      setPreviewText(result?.review_text ?? "");
    } catch {
      setPreviewText(t("review.complete.generateFailed"));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleFinish = async () => {
    const result = await finishInterview();
    if (result) {
      navigation.replace("ReviewComplete", {
        content,
        conversation,
        interviewId: interviewId ?? "",
      });
    }
  };

  const handleExitSave = async () => {
    setShowExitDialog(false);
    navigation.goBack();
  };

  const handleExitDiscard = async () => {
    await clearDraft();
    setShowExitDialog(false);
    navigation.goBack();
  };

  // Group conversation for display
  const displayPairs: { question: ConversationEntry; answer?: ConversationEntry }[] = [];
  for (let i = 0; i < conversation.length; i++) {
    const entry = conversation[i];
    if (entry.role === "interviewer") {
      const answer = conversation[i + 1]?.role === "user" ? conversation[i + 1] : undefined;
      displayPairs.push({ question: entry, answer });
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="px-6 py-3 flex-row items-center justify-between border-b border-surface-tertiary">
        <View className="flex-row items-center flex-1">
          <Text className="text-lg mr-2">{CATEGORY_ICONS[content.category]}</Text>
          <Text className="text-text font-semibold text-base flex-1" numberOfLines={1}>
            {content.title}
          </Text>
        </View>
        <Text className="text-text-secondary text-sm">
          {t("review.interview.questionCount", { count: questionCount })}
        </Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* Conversation */}
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-6"
          contentContainerClassName="py-4"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {displayPairs.map((pair, idx) => {
            const isPivot = pair.question.question_type === "pivot";
            const isNewTopic =
              isPivot ||
              pair.question.topic_label !== displayPairs[idx - 1]?.question.topic_label;

            const AnimWrapper = isPivot ? SlideInRight : FadeInDown;

            return (
              <Animated.View
                key={idx}
                entering={AnimWrapper.duration(300)}
                className="mb-6"
              >
                <QuestionCard
                  question={pair.question.text}
                  topicLabel={pair.question.topic_label ?? ""}
                  questionNumber={idx + 1}
                  isNewTopic={isNewTopic}
                />
                {pair.answer && (
                  <Animated.View entering={FadeIn.delay(100)} className="mt-3 ml-4">
                    <View className="bg-primary/10 rounded-2xl p-4">
                      <Text className="text-text text-base leading-6">{pair.answer.text}</Text>
                    </View>
                  </Animated.View>
                )}
              </Animated.View>
            );
          })}

          {/* Loading indicator for next question */}
          {isLoading && !showPreview && (
            <View className="items-center py-4">
              <ActivityIndicator size="small" color="#6366F1" />
            </View>
          )}

          {/* Error state */}
          {error === "retry" && (
            <View className="items-center py-4">
              <Text className="text-text-secondary text-sm mb-2">
                {t("review.interview.errorLoad")}
              </Text>
              <Pressable
                className="bg-primary/10 px-4 py-2 rounded-full"
                onPress={() => { setError(null); fetchQuestion(conversation, questionCount); }}
              >
                <Text className="text-primary font-medium text-sm">
                  {t("review.interview.retry")}
                </Text>
              </Pressable>
            </View>
          )}
          {error === "persist" && (
            <View className="items-center py-4">
              <Text className="text-text-secondary text-sm mb-2 text-center">
                {t("review.interview.errorPersist")}
              </Text>
              <Pressable
                className="bg-primary/10 px-4 py-2 rounded-full"
                onPress={() => navigation.goBack()}
              >
                <Text className="text-primary font-medium text-sm">
                  {t("review.interview.continueLater")}
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        {/* Bottom: Answer input + action buttons */}
        <View className="px-6 pb-4 pt-2 border-t border-surface-tertiary">
          {/* Action buttons (visible after 5 answers) */}
          {canPreview && (
            <View className="flex-row mb-3 gap-3">
              <Pressable
                className="flex-1 bg-surface-tertiary rounded-xl py-3 items-center"
                onPress={handlePreview}
              >
                <Text className="text-text font-medium text-sm">
                  {t("review.interview.previewButton")}
                </Text>
              </Pressable>
              <Pressable
                className="flex-1 bg-primary rounded-xl py-3 items-center"
                onPress={handleFinish}
                disabled={isLoading}
              >
                <Text className="text-white font-medium text-sm">
                  {t("review.interview.finishButton")}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Answer input */}
          <View className="flex-row items-end">
            <TextInput
              className="flex-1 bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3 text-text text-base mr-3 max-h-24"
              placeholder={t("review.interview.answerPlaceholder")}
              placeholderTextColor="#94A3B8"
              value={answerText}
              onChangeText={setAnswerText}
              multiline
              editable={!isLoading && !error}
            />
            <Pressable
              className={`rounded-xl px-5 py-3 ${
                answerText.trim() && !isLoading ? "bg-primary" : "bg-primary/40"
              }`}
              onPress={handleSubmitAnswer}
              disabled={!answerText.trim() || isLoading}
            >
              <Text className="text-white font-semibold">→</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Preview Modal */}
      {showPreview && (
        <ConfirmDialog
          visible={showPreview}
          title={t("review.interview.previewButton")}
          message={previewLoading ? "..." : previewText}
          actions={[
            { label: t("common.close"), onPress: () => setShowPreview(false) },
          ]}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Exit Confirm */}
      <ConfirmDialog
        visible={showExitDialog}
        title={t("review.interview.exitConfirmTitle")}
        message={t("review.interview.exitConfirmMessage")}
        actions={[
          { label: t("review.interview.exitConfirmSave"), onPress: handleExitSave, variant: "primary" },
          { label: t("review.interview.exitConfirmDiscard"), onPress: handleExitDiscard, variant: "destructive" },
          { label: t("review.interview.exitConfirmCancel"), onPress: () => setShowExitDialog(false) },
        ]}
        onClose={() => setShowExitDialog(false)}
      />
    </SafeAreaView>
  );
}

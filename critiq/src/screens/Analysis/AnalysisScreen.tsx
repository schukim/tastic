import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import type { MainTabParamList } from "../../types/navigation";
import type { TasteProfile, ContentCategory } from "../../types/database";
import { useAuthStore } from "../../stores/authStore";
import { getLatestTasteProfile, saveTasteProfile, getReviewCount } from "../../services/taste";
import { fetchReviews } from "../../services/review";
import { analyzeTaste } from "../../services/claude";

type Nav = BottomTabNavigationProp<MainTabParamList, "AnalysisTab">;

const LOADING_MESSAGES_KO = [
  "평론을 읽고 있어요...",
  "패턴을 찾고 있어요...",
  "취향을 정리하고 있어요...",
];
const LOADING_MESSAGES_EN = [
  "Reading your reviews...",
  "Finding patterns...",
  "Composing your profile...",
];

const MIN_REVIEWS = 3;

const CATEGORY_LABELS: Record<string, string> = {
  movie: "영화",
  music: "음악",
  book: "책",
  art: "미술",
  exhibition: "전시",
  performance: "공연",
};

export function AnalysisScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const lang = user?.language ?? "ko";

  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [newReviewCount, setNewReviewCount] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingMessageIdx, setLoadingMessageIdx] = useState(0);
  const [error, setError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [profileData, count] = await Promise.all([
        getLatestTasteProfile(user.id),
        getReviewCount(user.id),
      ]);
      setProfile(profileData);
      setReviewCount(count);
      if (profileData) {
        setNewReviewCount(count - profileData.review_count);
      }
    } catch {
      // ignore
    } finally {
      setIsLoaded(true);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    if (!isAnalyzing) return;
    const interval = setInterval(() => {
      setLoadingMessageIdx((prev) => (prev + 1) % 3);
    }, 2000);
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  const handleAnalyze = async () => {
    if (!user) return;
    setIsAnalyzing(true);
    setError(false);
    setLoadingMessageIdx(0);

    try {
      const reviews = await fetchReviews(user.id);
      const reviewData = reviews.map((r) => ({
        content_title: r.contents?.title ?? "",
        category: (r.contents?.category ?? "movie") as ContentCategory,
        review_text: r.body,
        created_at: r.created_at,
      }));

      const previousProfile = profile
        ? profile.profile_sentences.join("\n")
        : null;

      const result = await analyzeTaste({
        reviews: reviewData,
        previous_profile: previousProfile,
        language: lang,
      });

      const saved = await saveTasteProfile(
        user.id,
        result.profile_sentences,
        result.recommendation_hook,
        reviews.length
      );

      setProfile(saved);
      setNewReviewCount(0);
    } catch {
      setError(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRecommendHook = () => {
    if (!profile?.recommendation_hook) return;
    navigation.navigate("RecommendTab", {
      autoPrompt: profile.recommendation_hook,
    } as any);
  };

  // ── Loading ──
  if (!isLoaded) {
    return (
      <SafeAreaView className="flex-1 bg-surface dark:bg-surface-dark justify-center items-center">
        <ActivityIndicator size="large" color="#6B6560" />
      </SafeAreaView>
    );
  }

  // ── Analyzing ──
  if (isAnalyzing) {
    const messages = lang === "ko" ? LOADING_MESSAGES_KO : LOADING_MESSAGES_EN;
    return (
      <SafeAreaView className="flex-1 bg-surface dark:bg-surface-dark justify-center items-center px-8">
        <View className="items-center">
          <ActivityIndicator size="large" color="#6B6560" />
          <Animated.Text
            key={loadingMessageIdx}
            entering={FadeIn.duration(400)}
            className="text-text-secondary dark:text-text-dark-secondary text-base mt-8 text-center"
          >
            {messages[loadingMessageIdx]}
          </Animated.Text>
          <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs mt-3 text-center">
            {lang === "ko" ? "잠시만 기다려 주세요" : "This may take a moment"}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── No profile yet ──
  if (!profile) {
    const canAnalyze = reviewCount >= MIN_REVIEWS;
    const progress = Math.min(reviewCount / MIN_REVIEWS, 1);

    return (
      <SafeAreaView className="flex-1 bg-surface dark:bg-surface-dark">
        <ScrollView className="flex-1" contentContainerClassName="flex-1 justify-center px-8 pb-12">
          <View className="items-center">
            {/* Icon */}
            <View className="w-20 h-20 rounded-full bg-surface-tertiary dark:bg-surface-dark-secondary items-center justify-center mb-8">
              <Text className="text-4xl">{canAnalyze ? "✨" : "📖"}</Text>
            </View>

            {canAnalyze ? (
              <>
                <Text className="text-text dark:text-text-dark text-2xl font-bold text-center mb-3">
                  {lang === "ko" ? "준비가 됐어요" : "Ready to analyze"}
                </Text>
                <Text className="text-text-secondary dark:text-text-dark-secondary text-base text-center leading-6 mb-10">
                  {t("analysis.empty")}
                </Text>
                <Pressable
                  className="bg-text dark:bg-primary-dm rounded-2xl px-10 py-4"
                  onPress={handleAnalyze}
                >
                  <Text className="text-surface dark:text-surface-dark font-semibold text-base">
                    {t("analysis.analyzeButton")}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text className="text-text dark:text-text-dark text-2xl font-bold text-center mb-3">
                  {lang === "ko" ? "조금만 더" : "Almost there"}
                </Text>
                <Text className="text-text-secondary dark:text-text-dark-secondary text-base text-center leading-6 mb-8">
                  {t("analysis.needMore", { current: reviewCount })}
                </Text>

                {/* Progress bar */}
                <View className="w-full mb-2">
                  <View className="h-1.5 bg-surface-tertiary dark:bg-surface-dark-tertiary rounded-full overflow-hidden">
                    <View
                      className="h-full bg-text dark:bg-primary-dm rounded-full"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </View>
                </View>
                <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs mb-10">
                  {reviewCount} / {MIN_REVIEWS}
                </Text>

                <Pressable
                  className="border border-text dark:border-primary-dm rounded-2xl px-8 py-3.5"
                  onPress={() => navigation.navigate("ReviewTab" as any)}
                >
                  <Text className="text-text dark:text-primary-dm font-medium">
                    {t("history.goToReview")}
                  </Text>
                </Pressable>
              </>
            )}

            {error && (
              <Text className="text-error text-sm mt-6 text-center">{t("analysis.error")}</Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Analysis complete ──
  const updatedAt = new Date(profile.created_at).toLocaleDateString(
    lang === "ko" ? "ko-KR" : "en-US",
    { year: "numeric", month: "long", day: "numeric" }
  );

  return (
    <SafeAreaView className="flex-1 bg-surface dark:bg-surface-dark">
      <ScrollView className="flex-1" contentContainerClassName="pb-12">

        {/* ── Page Header ── */}
        <View className="px-6 pt-6 pb-4 flex-row items-start justify-between">
          <View className="flex-1 mr-4">
            <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs uppercase tracking-widest mb-1">
              {lang === "ko" ? "취향 분석" : "Taste Profile"}
            </Text>
            <Text className="text-text dark:text-text-dark text-2xl font-bold">
              {user?.nickname ?? ""}
            </Text>
          </View>
          <View className="items-end">
            {newReviewCount > 0 && (
              <Animated.View entering={FadeIn} className="bg-surface-tertiary dark:bg-surface-dark-tertiary px-2.5 py-1 rounded-full mb-2">
                <Text className="text-text-secondary dark:text-text-dark-secondary text-xs font-medium">
                  {lang === "ko" ? `+${newReviewCount}편 반영 가능` : `+${newReviewCount} new`}
                </Text>
              </Animated.View>
            )}
            <Pressable onPress={handleAnalyze} className="py-1">
              <Text className="text-text-secondary dark:text-text-dark-secondary text-sm">
                {t("analysis.reanalyze")}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── Divider ── */}
        <View className="h-px bg-surface-tertiary dark:bg-surface-dark-tertiary mx-6 mb-6" />

        {/* ── Profile Sentences ── */}
        <View className="px-6 mb-6">
          {profile.profile_sentences.map((sentence, idx) => (
            <Animated.View
              key={idx}
              entering={FadeInDown.delay(idx * 80).duration(400)}
              className="mb-5"
            >
              <View className="flex-row">
                <Text className="text-text-tertiary dark:text-text-dark-tertiary text-base mr-3 mt-0.5">
                  {String(idx + 1).padStart(2, "0")}
                </Text>
                <Text className="text-text dark:text-text-dark text-base leading-7 flex-1">
                  {sentence}
                </Text>
              </View>
            </Animated.View>
          ))}
        </View>

        {/* ── Meta ── */}
        <View className="mx-6 mb-8 flex-row items-center">
          <View className="h-px flex-1 bg-surface-tertiary dark:bg-surface-dark-tertiary" />
          <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs mx-3">
            {lang === "ko"
              ? `평론 ${profile.review_count}편 · ${updatedAt}`
              : `${profile.review_count} reviews · ${updatedAt}`}
          </Text>
          <View className="h-px flex-1 bg-surface-tertiary dark:bg-surface-dark-tertiary" />
        </View>

        {/* ── Error ── */}
        {error && (
          <Text className="text-error text-sm text-center mx-6 mb-4">
            {t("analysis.error")}
          </Text>
        )}

        {/* ── Recommendation Hook ── */}
        {profile.recommendation_hook && (
          <Animated.View
            entering={FadeInDown.delay(400).duration(400)}
            className="mx-6"
          >
            <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs uppercase tracking-widest mb-3">
              {lang === "ko" ? "이런 건 어때요" : "You might enjoy"}
            </Text>
            <Pressable
              className="bg-surface-secondary dark:bg-surface-dark-secondary border border-surface-border dark:border-surface-dark-border rounded-2xl p-5"
              onPress={handleRecommendHook}
            >
              <Text className="text-text dark:text-text-dark text-base leading-6 mb-3">
                {profile.recommendation_hook}
              </Text>
              <View className="flex-row items-center">
                <Text className="text-text-secondary dark:text-text-dark-secondary text-sm">
                  {lang === "ko" ? "추천 받기" : "Get recommendations"}
                </Text>
                <Text className="text-text-secondary dark:text-text-dark-secondary text-sm ml-1.5">→</Text>
              </View>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

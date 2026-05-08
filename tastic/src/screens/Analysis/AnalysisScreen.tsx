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
import { useTheme } from "../../hooks/useTheme";
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
};

export function AnalysisScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const { isDark } = useTheme();
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

  // ── Enhanced Loading ──
  if (!isLoaded) {
    return (
      <SafeAreaView className={`flex-1 justify-center items-center ${isDark ? 'dark' : ''}`} style={{ backgroundColor: isDark ? '#1A1814' : '#F8F6F1' }}>
        <View className="items-center">
          <View className="w-20 h-20 rounded-3xl bg-surface-secondary dark:bg-surface-dark-secondary items-center justify-center mb-6">
            <ActivityIndicator size="large" color={isDark ? '#D4CFC8' : '#221F1A'} />
          </View>
          <Text className="text-text-secondary dark:text-text-dark-secondary text-base font-medium">
            {lang === "ko" ? "로딩 중..." : "Loading..."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Enhanced Analyzing ──
  if (isAnalyzing) {
    const messages = lang === "ko" ? LOADING_MESSAGES_KO : LOADING_MESSAGES_EN;
    return (
      <SafeAreaView className={`flex-1 justify-center items-center px-8 ${isDark ? 'dark' : ''}`} style={{ backgroundColor: isDark ? '#1A1814' : '#F8F6F1' }}>
        <View className="items-center">
          <View className="w-24 h-24 rounded-3xl bg-surface-secondary dark:bg-surface-dark-secondary items-center justify-center mb-8 shadow-lg">
            <ActivityIndicator size="large" color={isDark ? '#D4CFC8' : '#221F1A'} />
          </View>
          <Animated.Text
            key={loadingMessageIdx}
            entering={FadeIn.duration(500)}
            className="text-text dark:text-text-dark text-xl font-bold text-center mb-3"
          >
            {messages[loadingMessageIdx]}
          </Animated.Text>
          <Text className="text-text-secondary dark:text-text-dark-secondary text-base text-center font-medium">
            {lang === "ko" ? "취향을 심도있게 분석하고 있어요" : "Deep analyzing your taste patterns"}
          </Text>
          <View className="flex-row mt-6 gap-2">
            <View className="w-2 h-2 bg-primary dark:bg-primary-dm rounded-full animate-pulse" />
            <View className="w-2 h-2 bg-primary dark:bg-primary-dm rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
            <View className="w-2 h-2 bg-primary dark:bg-primary-dm rounded-full animate-pulse" style={{ animationDelay: '0.6s' }} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Enhanced No profile yet ──
  if (!profile) {
    const canAnalyze = reviewCount >= MIN_REVIEWS;
    const progress = Math.min(reviewCount / MIN_REVIEWS, 1);

    return (
      <SafeAreaView className={`flex-1 ${isDark ? 'dark' : ''}`} style={{ backgroundColor: isDark ? '#1A1814' : '#F8F6F1' }}>
        <ScrollView className="flex-1" contentContainerStyle={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 48 }}>
          <Animated.View entering={FadeInDown.duration(600)} className="items-center">
            {/* Enhanced Icon */}
            <View className="w-24 h-24 rounded-3xl bg-surface-secondary dark:bg-surface-dark-secondary items-center justify-center mb-8 shadow-lg border-2 border-surface-border/30 dark:border-surface-dark-border/30">
              <Text className="text-5xl">{canAnalyze ? "✨" : "📚"}</Text>
            </View>

            {canAnalyze ? (
              <>
                <Text className="text-text dark:text-text-dark text-3xl font-bold text-center mb-4 leading-tight">
                  {lang === "ko" ? "준비가 됐어요!" : "Ready to analyze"}
                </Text>
                <Text className="text-text-secondary dark:text-text-dark-secondary text-lg text-center leading-7 mb-12 font-medium">
                  {t("analysis.empty")}
                </Text>
                <Pressable
                  className="bg-text dark:bg-primary-dm rounded-3xl px-12 py-5 active:scale-95 transition-transform shadow-xl"
                  onPress={handleAnalyze}
                >
                  <Text className="text-surface dark:text-surface-dark font-bold text-lg">
                    {t("analysis.analyzeButton")}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text className="text-text dark:text-text-dark text-3xl font-bold text-center mb-4 leading-tight">
                  {lang === "ko" ? "조금만 더!" : "Almost there"}
                </Text>
                <Text className="text-text-secondary dark:text-text-dark-secondary text-lg text-center leading-7 mb-10 font-medium">
                  {t("analysis.needMore", { current: reviewCount })}
                </Text>

                {/* Enhanced Progress bar */}
                <View className="w-full mb-3">
                  <View className="h-3 bg-surface-tertiary dark:bg-surface-dark-tertiary rounded-full overflow-hidden shadow-inner">
                    <Animated.View
                      entering={FadeInDown.delay(300).duration(800)}
                      className="h-full bg-gradient-to-r from-primary to-primary-light dark:from-primary-dm dark:to-primary-dm-sub rounded-full"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </View>
                </View>
                <Text className="text-text-secondary dark:text-text-dark-secondary text-base mb-12 font-semibold">
                  {reviewCount} / {MIN_REVIEWS} 평론
                </Text>

                <Pressable
                  className="border-2 border-text dark:border-primary-dm rounded-3xl px-10 py-4 active:scale-95 transition-transform"
                  onPress={() => navigation.navigate("ReviewTab" as any)}
                >
                  <Text className="text-text dark:text-primary-dm font-bold text-base">
                    {t("history.goToReview")}
                  </Text>
                </Pressable>
              </>
            )}

            {error && (
              <Animated.View entering={FadeIn.delay(200)} className="mt-8 bg-error/10 rounded-2xl p-4">
                <Text className="text-error text-sm text-center font-medium">{t("analysis.error")}</Text>
              </Animated.View>
            )}
          </Animated.View>
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
    <SafeAreaView className={`flex-1 ${isDark ? 'dark' : ''}`} style={{ backgroundColor: isDark ? '#1A1814' : '#F8F6F1' }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

        {/* ── Enhanced Page Header ── */}
        <Animated.View entering={FadeInDown.duration(400)} className="px-7 pt-8 pb-6">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 mr-4">
              <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs uppercase tracking-[3px] mb-2 font-semibold">
                {lang === "ko" ? "취향 분석" : "Taste Profile"}
              </Text>
              <Text className="text-text dark:text-text-dark text-3xl font-bold leading-tight">
                {user?.nickname ?? ""}
              </Text>
              <View className="w-20 h-1 bg-primary dark:bg-primary-dm rounded-full mt-3" />
            </View>
            <View className="items-end">
              {newReviewCount > 0 && (
                <Animated.View entering={FadeIn.delay(200)} className="bg-primary/15 dark:bg-primary-dm/15 px-4 py-2 rounded-2xl mb-3 border border-primary/20 dark:border-primary-dm/20">
                  <Text className="text-primary dark:text-primary-dm text-xs font-bold">
                    {lang === "ko" ? `+${newReviewCount}편 새로운 평론` : `+${newReviewCount} new reviews`}
                  </Text>
                </Animated.View>
              )}
              <Pressable onPress={handleAnalyze} className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-2xl px-4 py-2 border border-surface-border/50 dark:border-surface-dark-border/50 active:scale-95 transition-transform">
                <Text className="text-text-secondary dark:text-text-dark-secondary text-sm font-semibold">
                  {t("analysis.reanalyze")}
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* ── Elegant Divider ── */}
        <View className="mx-7 mb-8 flex-row items-center">
          <View className="flex-1 h-px bg-gradient-to-r from-transparent via-surface-border dark:via-surface-dark-border to-transparent" />
          <View className="w-3 h-3 rounded-full mx-4 bg-primary/20 dark:bg-primary-dm/20" />
          <View className="flex-1 h-px bg-gradient-to-r from-transparent via-surface-border dark:via-surface-dark-border to-transparent" />
        </View>

        {/* ── Enhanced Profile Sentences ── */}
        <View className="px-7 mb-8">
          {profile.profile_sentences.map((sentence, idx) => (
            <Animated.View
              key={idx}
              entering={FadeInDown.delay(300 + idx * 150).duration(600)}
              className="mb-6"
            >
              <View className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-3xl p-6 border-2 border-surface-border/30 dark:border-surface-dark-border/30 shadow-sm">
                <View className="flex-row items-start">
                  <View className="w-8 h-8 rounded-2xl bg-primary/15 dark:bg-primary-dm/15 items-center justify-center mr-4 mt-1">
                    <Text className="text-primary dark:text-primary-dm text-sm font-bold">
                      {String(idx + 1).padStart(2, "0")}
                    </Text>
                  </View>
                  <Text className="text-text dark:text-text-dark text-lg leading-8 flex-1 font-normal">
                    {sentence}
                  </Text>
                </View>
              </View>
            </Animated.View>
          ))}
        </View>

        {/* ── Enhanced Meta ── */}
        <View className="mx-7 mb-10 flex-row items-center">
          <View className="flex-1 h-px bg-gradient-to-r from-surface-border dark:from-surface-dark-border to-transparent" />
          <View className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-2xl px-5 py-3 mx-4 border border-surface-border/50 dark:border-surface-dark-border/50">
            <Text className="text-text-secondary dark:text-text-dark-secondary text-sm font-semibold text-center">
              {lang === "ko"
                ? `평론 ${profile.review_count}편 기반`
                : `Based on ${profile.review_count} reviews`}
            </Text>
            <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs text-center mt-1">
              {updatedAt}
            </Text>
          </View>
          <View className="flex-1 h-px bg-gradient-to-l from-surface-border dark:from-surface-dark-border to-transparent" />
        </View>

        {/* ── Enhanced Error ── */}
        {error && (
          <Animated.View entering={FadeIn} className="mx-7 mb-6">
            <View className="bg-error/10 dark:bg-error/20 rounded-3xl p-6 border-2 border-error/20 dark:border-error/30">
              <Text className="text-error text-base text-center font-medium">
                {t("analysis.error")}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* ── Enhanced Recommendation Hook ── */}
        {profile.recommendation_hook && (
          <Animated.View
            entering={FadeInDown.delay(600).duration(600)}
            className="mx-7"
          >
            <View className="mb-4 flex-row items-center">
              <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs uppercase tracking-[3px] font-semibold">
                {lang === "ko" ? "맞춤 추천" : "Personalized Pick"}
              </Text>
              <View className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-primary-light dark:from-primary-dm dark:to-primary-dm-sub items-center justify-center ml-3">
                <Text className="text-white text-xs font-bold">✨</Text>
              </View>
            </View>
            <Pressable
              className="bg-gradient-to-br from-surface-secondary to-surface-tertiary dark:from-surface-dark-secondary dark:to-surface-dark-tertiary border-2 border-surface-border/50 dark:border-surface-dark-border/50 rounded-3xl p-7 shadow-lg active:scale-98 transition-transform"
              onPress={handleRecommendHook}
            >
              <Text className="text-text dark:text-text-dark text-lg leading-8 mb-5 font-normal">
                {profile.recommendation_hook}
              </Text>
              <View className="flex-row items-center justify-between">
                <Text className="text-text-secondary dark:text-text-dark-secondary text-base font-semibold">
                  {lang === "ko" ? "지금 추천받기" : "Get recommendations now"}
                </Text>
                <View className="w-8 h-8 rounded-2xl bg-primary/20 dark:bg-primary-dm/20 items-center justify-center">
                  <Text className="text-primary dark:text-primary-dm text-base font-bold">→</Text>
                </View>
              </View>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

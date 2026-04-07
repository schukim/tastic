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
import Animated, { FadeIn } from "react-native-reanimated";
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

  // Loading message rotation
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
    // Navigate to recommend tab with auto-prompt
    navigation.navigate("RecommendTab", {
      autoPrompt: profile.recommendation_hook,
    } as any);
  };

  if (!isLoaded) {
    return (
      <SafeAreaView className="flex-1 bg-surface justify-center items-center">
        <ActivityIndicator size="large" color="#6366F1" />
      </SafeAreaView>
    );
  }

  // ── State 2: Analyzing ──
  if (isAnalyzing) {
    const messages = lang === "ko" ? LOADING_MESSAGES_KO : LOADING_MESSAGES_EN;
    return (
      <SafeAreaView className="flex-1 bg-surface justify-center items-center px-6">
        <ActivityIndicator size="large" color="#6366F1" />
        <Animated.Text
          key={loadingMessageIdx}
          entering={FadeIn}
          className="text-text-secondary text-base mt-6"
        >
          {messages[loadingMessageIdx]}
        </Animated.Text>
      </SafeAreaView>
    );
  }

  // ── State 1: No analysis yet ──
  if (!profile) {
    const canAnalyze = reviewCount >= MIN_REVIEWS;
    return (
      <SafeAreaView className="flex-1 bg-surface justify-center items-center px-6">
        <Text className="text-4xl mb-6">🔍</Text>
        {canAnalyze ? (
          <>
            <Text className="text-text text-base text-center mb-6">
              {t("analysis.empty")}
            </Text>
            <Pressable className="bg-primary rounded-xl px-8 py-4" onPress={handleAnalyze}>
              <Text className="text-white font-semibold text-base">
                {t("analysis.analyzeButton")}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text className="text-text-secondary text-base text-center mb-4">
              {t("analysis.needMore", { current: reviewCount })}
            </Text>
            <Pressable
              className="bg-surface-tertiary rounded-xl px-6 py-3"
              onPress={() => navigation.navigate("ReviewTab" as any)}
            >
              <Text className="text-primary font-medium">{t("history.goToReview")}</Text>
            </Pressable>
          </>
        )}
        {error && (
          <Text className="text-error text-sm mt-4">{t("analysis.error")}</Text>
        )}
      </SafeAreaView>
    );
  }

  // ── State 3: Analysis complete ──
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView className="flex-1" contentContainerClassName="px-6 pt-6 pb-12">
        {/* Re-analyze button */}
        <View className="flex-row justify-end items-center mb-6">
          {newReviewCount > 0 && (
            <View className="bg-primary/10 px-2.5 py-1 rounded-full mr-2">
              <Text className="text-primary text-xs font-medium">
                {t("analysis.newReviewBadge", { count: newReviewCount })}
              </Text>
            </View>
          )}
          <Pressable onPress={handleAnalyze}>
            <Text className="text-primary text-sm font-medium">
              {t("analysis.reanalyze")}
            </Text>
          </Pressable>
        </View>

        {/* Profile card */}
        <Animated.View entering={FadeIn} className="bg-surface-secondary rounded-2xl p-6 mb-6">
          <Text className="text-text text-lg font-bold mb-4">
            {t("analysis.profileTitle", { name: user?.nickname ?? "" })}
          </Text>

          {profile.profile_sentences.map((sentence, idx) => (
            <View key={idx} className="flex-row mb-3">
              <Text className="text-primary mr-2">·</Text>
              <Text className="text-text text-base leading-6 flex-1">{sentence}</Text>
            </View>
          ))}

          <Text className="text-text-tertiary text-xs mt-4">
            {new Date(profile.created_at).toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US")}
            {" · "}
            {lang === "ko" ? `평론 ${profile.review_count}개 반영` : `Based on ${profile.review_count} reviews`}
          </Text>
        </Animated.View>

        {/* Error */}
        {error && (
          <Text className="text-error text-sm text-center mb-4">{t("analysis.error")}</Text>
        )}

        {/* Recommendation hook */}
        {profile.recommendation_hook && (
          <>
            <View className="h-px bg-surface-tertiary mb-6" />
            <Pressable
              className="bg-primary/5 border border-primary/20 rounded-2xl p-5"
              onPress={handleRecommendHook}
            >
              <Text className="text-text text-base leading-6">
                {profile.recommendation_hook}
              </Text>
              <Text className="text-primary text-sm font-medium mt-2">→</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

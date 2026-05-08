import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRoute, useNavigation } from "@react-navigation/native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import type { ContentCategory } from "../../types/database";
import type { RecommendContentResponse } from "../../types/llm";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import { getLatestTasteProfile } from "../../services/taste";
import { fetchReviews } from "../../services/review";
import { getReviewCount } from "../../services/taste";
import { recommendContent } from "../../services/claude";
import { saveRecommendation } from "../../services/recommendation";
import { SkeletonCard } from "../../components/common/SkeletonCard";
import { CATEGORY_ICONS } from "../../components/common/CategoryChip";

interface RecommendItem {
  title: string;
  category: ContentCategory;
  creator: string;
  year: number | null;
  reason: string;
  reason_short: string;
}

const QUICK_CHIPS = [
  { key: "chipMovie", prompt: "영화 추천해줘", icon: "🎬" },
  { key: "chipBook", prompt: "책 추천해줘", icon: "📚" },
  { key: "chipMusic", prompt: "음악 추천해줘", icon: "🎵" },
  { key: "chipNew", prompt: "새로운 장르 도전하고 싶어", icon: "✦" },
];

const CATEGORY_ACCENT: Record<string, string> = {
  movie:       "#5C2E2E",
  music:       "#2E3D4F",
  book:        "#3D4A2E",
  art:         "#5C4A2E",
};

export function RecommendScreen() {
  const { t } = useTranslation();
  const route = useRoute();
  const navigation = useNavigation();
  const user = useAuthStore((s) => s.user);
  const { isDark } = useTheme();
  const lang = user?.language ?? "ko";

  const [prompt, setPrompt] = useState("");
  const [results, setResults] = useState<RecommendItem[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reviewCount, setReviewCount] = useState<number | null>(null);

  useEffect(() => {
    const params = route.params as { autoPrompt?: string } | undefined;
    if (params?.autoPrompt) {
      setPrompt(params.autoPrompt);
      handleSubmit(params.autoPrompt);
    }
  }, [route.params]);

  useEffect(() => {
    if (user) {
      getReviewCount(user.id).then(setReviewCount);
    }
  }, [user]);

  const handleSubmit = async (overridePrompt?: string) => {
    const queryPrompt = overridePrompt ?? prompt;
    if (!queryPrompt.trim() || !user) return;

    setIsLoading(true);
    setError(false);
    setResults([]);
    setExpandedIdx(null);

    try {
      const [tasteProfile, reviews] = await Promise.all([
        getLatestTasteProfile(user.id),
        fetchReviews(user.id),
      ]);

      const response = await recommendContent({
        taste_profile: tasteProfile?.profile_sentences ?? [],
        user_prompt: queryPrompt.trim(),
        review_history: reviews.map((r) => ({
          content_title: r.contents?.title ?? "",
          category: (r.contents?.category ?? "movie") as ContentCategory,
        })),
        language: lang,
      });

      setResults(response.recommendations as RecommendItem[]);
      saveRecommendation(user.id, queryPrompt.trim(), response.recommendations).catch(() => {});
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const notEnoughReviews = reviewCount !== null && reviewCount < 3;

  if (reviewCount === null) {
    return (
      <SafeAreaView className={`flex-1 ${isDark ? 'dark' : ''}`} style={{ backgroundColor: isDark ? '#1A1814' : '#F8F6F1' }} />
    );
  }

  if (notEnoughReviews) {
    const progress = Math.min((reviewCount ?? 0) / 3, 1);
    return (
      <SafeAreaView className={`flex-1 ${isDark ? 'dark' : ''}`} style={{ backgroundColor: isDark ? '#1A1814' : '#F8F6F1' }}>
        <ScrollView className="flex-1" contentContainerStyle={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 48 }}>
          <Animated.View entering={FadeInDown.duration(600)} className="items-center">
            <View className="w-24 h-24 rounded-3xl bg-surface-secondary dark:bg-surface-dark-secondary items-center justify-center mb-8 shadow-lg border-2 border-surface-border/30 dark:border-surface-dark-border/30">
              <Text className="text-5xl">💡</Text>
            </View>

            <Text className="text-text dark:text-text-dark text-3xl font-bold text-center mb-4 leading-tight">
              {lang === "ko" ? "조금만 더!" : "Almost there"}
            </Text>
            <Text className="text-text-secondary dark:text-text-dark-secondary text-lg text-center leading-7 mb-10 font-medium">
              {lang === "ko"
                ? `평론 ${3 - (reviewCount ?? 0)}편만 더 작성하면\n취향 기반 추천을 받을 수 있어요`
                : `Write ${3 - (reviewCount ?? 0)} more review${3 - (reviewCount ?? 0) > 1 ? 's' : ''} to\nunlock personalized recommendations`}
            </Text>

            <View className="w-full mb-3">
              <View className="h-3 bg-surface-tertiary dark:bg-surface-dark-tertiary rounded-full overflow-hidden shadow-inner">
                <Animated.View
                  entering={FadeInDown.delay(300).duration(800)}
                  className="h-full bg-primary dark:bg-primary-dm rounded-full"
                  style={{ width: `${progress * 100}%` }}
                />
              </View>
            </View>
            <Text className="text-text-secondary dark:text-text-dark-secondary text-base mb-12 font-semibold">
              {reviewCount} / 3 {lang === "ko" ? "평론" : "reviews"}
            </Text>

            <Pressable
              className="border-2 border-text dark:border-primary-dm rounded-3xl px-10 py-4 active:scale-95 transition-transform"
              onPress={() => navigation.navigate("ReviewTab" as never)}
            >
              <Text className="text-text dark:text-primary-dm font-bold text-base">
                {lang === "ko" ? "평론 쓰러 가기" : "Write a review"}
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'dark' : ''}`} style={{ backgroundColor: isDark ? '#1A1814' : '#F8F6F1' }}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Enhanced Header ── */}
          <View className="px-7 pt-8 pb-6">
            <Animated.View entering={FadeInDown.duration(400)}>
              <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs uppercase tracking-[3px] mb-2 font-semibold">
                {lang === "ko" ? "콘텐츠 추천" : "Recommendations"}
              </Text>
              <Text className="text-text dark:text-text-dark text-3xl font-bold leading-tight">
                {t("recommend.title")}
              </Text>
              <View className="w-16 h-1 bg-primary dark:bg-primary-dm rounded-full mt-3" />
            </Animated.View>
          </View>

          {/* ── Enhanced Input area ── */}
          <Animated.View entering={FadeInDown.delay(200).duration(400)} className="px-7 mb-6">
            <View className="bg-surface-secondary dark:bg-surface-dark-secondary border-2 border-surface-border/50 dark:border-surface-dark-border/50 rounded-3xl shadow-sm overflow-hidden">
              <TextInput
                className="px-6 pt-5 pb-4 text-text dark:text-text-dark text-base leading-7 font-normal"
                placeholder={t("recommend.placeholder")}
                placeholderTextColor={isDark ? '#7A7268' : '#9C9589'}
                value={prompt}
                onChangeText={setPrompt}
                editable={!isLoading}
                multiline
                textAlignVertical="top"
                style={{
                  minHeight: 64,
                  fontSize: 16,
                  fontWeight: '400'
                }}
              />
              <View className="flex-row justify-end px-4 pb-4">
                <Pressable
                  className={`rounded-2xl px-6 py-3 active:scale-95 transition-transform shadow-sm ${
                    prompt.trim() && !isLoading
                      ? "bg-text dark:bg-primary-dm shadow-lg"
                      : "bg-surface-tertiary dark:bg-surface-dark-tertiary"
                  }`}
                  onPress={() => handleSubmit()}
                  disabled={!prompt.trim() || isLoading}
                >
                  <Text className={`font-bold text-sm ${
                    prompt.trim() && !isLoading
                      ? "text-surface dark:text-surface-dark"
                      : "text-text-tertiary dark:text-text-dark-tertiary"
                  }`}>
                    {isLoading ? (lang === "ko" ? "분석중..." : "Thinking...") : (lang === "ko" ? "추천받기" : "Ask")}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>

          {/* ── Enhanced Quick chips ── */}
          {results.length === 0 && !isLoading && (
            <Animated.View entering={FadeInDown.delay(300).duration(400)} className="px-7 mb-8">
              <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs mb-4 uppercase tracking-wider font-semibold">
                {lang === "ko" ? "빠른 선택" : "Quick pick"}
              </Text>
              <View className="flex-row flex-wrap gap-3">
                {QUICK_CHIPS.map((chip, index) => (
                  <Animated.View
                    key={chip.key}
                    entering={FadeInDown.delay(350 + index * 100).duration(400)}
                  >
                    <Pressable
                      className="bg-surface-secondary dark:bg-surface-dark-secondary border-2 border-surface-border/50 dark:border-surface-dark-border/50 rounded-2xl px-5 py-3 flex-row items-center active:scale-95 transition-transform shadow-sm"
                      onPress={() => {
                        setPrompt(chip.prompt);
                        handleSubmit(chip.prompt);
                      }}
                    >
                      <Text className="text-base mr-2">{chip.icon}</Text>
                      <Text className="text-text-secondary dark:text-text-dark-secondary text-sm font-medium">
                        {t(`recommend.${chip.key}`)}
                      </Text>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* ── Enhanced Loading ── */}
          {isLoading && (
            <Animated.View entering={FadeIn.duration(300)} className="px-7">
              <View className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-3xl p-8 border-2 border-surface-border/50 dark:border-surface-dark-border/50 mb-4">
                <View className="flex-row items-center justify-center mb-4">
                  <View className="w-2 h-2 bg-primary dark:bg-primary-dm rounded-full mr-2 animate-pulse" />
                  <View className="w-2 h-2 bg-primary dark:bg-primary-dm rounded-full mr-2 animate-pulse" style={{ animationDelay: '0.2s' }} />
                  <View className="w-2 h-2 bg-primary dark:bg-primary-dm rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                </View>
                <Text className="text-text-secondary dark:text-text-dark-secondary text-base text-center font-medium">
                  {lang === "ko" ? "취향을 분석하고 있어요..." : "Analyzing your taste..."}
                </Text>
              </View>
              <SkeletonCard />
              <SkeletonCard />
            </Animated.View>
          )}

          {/* ── Enhanced Error ── */}
          {error && (
            <Animated.View entering={FadeIn.duration(400)} className="mx-7">
              <View className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-3xl p-8 border-2 border-error/20 dark:border-error/30 items-center">
                <View className="w-16 h-16 rounded-3xl bg-error/10 dark:bg-error/20 items-center justify-center mb-4">
                  <Text className="text-3xl">⚠️</Text>
                </View>
                <Text className="text-text-secondary dark:text-text-dark-secondary text-base text-center leading-7 font-medium">
                  {t("recommend.error")}
                </Text>
                <Pressable
                  className="mt-4 bg-error/10 dark:bg-error/20 rounded-2xl px-4 py-2 active:scale-95 transition-transform"
                  onPress={() => handleSubmit()}
                >
                  <Text className="text-error text-sm font-semibold">
                    {lang === "ko" ? "다시 시도" : "Try again"}
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          )}

          {/* ── Enhanced Results ── */}
          {results.length > 0 && (
            <Animated.View entering={FadeInDown.delay(100).duration(400)} className="px-7">
              <View className="flex-row items-center justify-between mb-6">
                <View>
                  <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs uppercase tracking-[3px] font-semibold">
                    {lang === "ko" ? "추천 결과" : "Recommendations"}
                  </Text>
                  <Text className="text-text dark:text-text-dark text-xl font-bold mt-1">
                    {lang === "ko" ? `${results.length}편의 작품` : `${results.length} picks for you`}
                  </Text>
                </View>
                <View className="w-8 h-8 rounded-2xl bg-primary/20 dark:bg-primary-dm/20 items-center justify-center">
                  <Text className="text-primary dark:text-primary-dm font-bold text-lg">✨</Text>
                </View>
              </View>

              {results.map((item, idx) => {
                const isExpanded = expandedIdx === idx;
                const accentColor = CATEGORY_ACCENT[item.category] ?? "#6B6560";

                return (
                  <Animated.View
                    key={idx}
                    entering={FadeInDown.delay(200 + idx * 100).duration(500)}
                    className="mb-4"
                  >
                    <Pressable
                      className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-3xl overflow-hidden border-2 border-surface-border/50 dark:border-surface-dark-border/50 active:scale-98 transition-transform shadow-lg"
                      onPress={() => setExpandedIdx(isExpanded ? null : idx)}
                    >
                      {/* Enhanced Category accent strip */}
                      <View
                        className="h-2 w-full"
                        style={{
                          background: `linear-gradient(90deg, ${accentColor}00 0%, ${accentColor} 50%, ${accentColor}00 100%)`,
                          backgroundColor: accentColor
                        }}
                      />

                      <View className="p-6">
                        {/* Enhanced Category + expand toggle */}
                        <View className="flex-row items-center justify-between mb-4">
                          <View className="flex-row items-center">
                            <View
                              className="w-10 h-10 rounded-2xl items-center justify-center mr-3 shadow-sm"
                              style={{ backgroundColor: accentColor + '15' }}
                            >
                              <Text className="text-lg">
                                {CATEGORY_ICONS[item.category] ?? "📋"}
                              </Text>
                            </View>
                            <Text
                              className="text-sm font-bold uppercase tracking-wider"
                              style={{ color: accentColor }}
                            >
                              {item.category}
                            </Text>
                          </View>
                          <View className="w-8 h-8 rounded-full bg-surface-tertiary dark:bg-surface-dark-tertiary items-center justify-center">
                            <Text className="text-text-tertiary dark:text-text-dark-tertiary text-sm font-bold">
                              {isExpanded ? "▲" : "▼"}
                            </Text>
                          </View>
                        </View>

                        {/* Enhanced Title */}
                        <Text className="text-text dark:text-text-dark text-xl font-bold leading-7 mb-2">
                          {item.title}
                        </Text>

                        {/* Enhanced Creator + year */}
                        <Text className="text-text-secondary dark:text-text-dark-secondary text-base font-medium mb-4">
                          {item.creator}
                          {item.year && (
                            <Text className="text-text-tertiary dark:text-text-dark-tertiary">
                              {" · " + item.year}
                            </Text>
                          )}
                        </Text>

                        {/* Enhanced Reason */}
                        <Animated.Text
                          key={isExpanded ? "expanded" : "collapsed"}
                          entering={FadeIn.duration(300)}
                          className="text-text-secondary dark:text-text-dark-secondary text-base leading-7 font-normal"
                        >
                          {isExpanded ? item.reason : item.reason_short}
                        </Animated.Text>
                      </View>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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
import { useRoute } from "@react-navigation/native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import type { ContentCategory } from "../../types/database";
import type { RecommendContentResponse } from "../../types/llm";
import { useAuthStore } from "../../stores/authStore";
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
  exhibition:  "#3D2E4A",
  performance: "#5C3D2E",
};

export function RecommendScreen() {
  const { t } = useTranslation();
  const route = useRoute();
  const user = useAuthStore((s) => s.user);
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

  return (
    <SafeAreaView className="flex-1 bg-surface dark:bg-surface-dark">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="pb-8"
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Header ── */}
          <View className="px-6 pt-6 pb-5">
            <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs uppercase tracking-widest mb-1">
              {lang === "ko" ? "콘텐츠 추천" : "Recommendations"}
            </Text>
            <Text className="text-text dark:text-text-dark text-2xl font-bold">
              {t("recommend.title")}
            </Text>
          </View>

          {/* ── Input area ── */}
          <View className="px-6 mb-5">
            <View className="bg-surface-secondary dark:bg-surface-dark-secondary border border-surface-border dark:border-surface-dark-border rounded-2xl overflow-hidden">
              <TextInput
                className="px-4 pt-4 pb-3 text-text dark:text-text-dark text-base leading-6"
                placeholder={t("recommend.placeholder")}
                placeholderTextColor="#9C9589"
                value={prompt}
                onChangeText={setPrompt}
                editable={!isLoading}
                multiline
                textAlignVertical="top"
                style={{ minHeight: 56 }}
              />
              <View className="flex-row justify-end px-3 pb-3">
                <Pressable
                  className={`rounded-xl px-5 py-2.5 ${
                    prompt.trim() && !isLoading
                      ? "bg-text dark:bg-primary-dm"
                      : "bg-surface-tertiary dark:bg-surface-dark-tertiary"
                  }`}
                  onPress={() => handleSubmit()}
                  disabled={!prompt.trim() || isLoading}
                >
                  <Text className={`font-semibold text-sm ${
                    prompt.trim() && !isLoading
                      ? "text-surface dark:text-surface-dark"
                      : "text-text-tertiary dark:text-text-dark-tertiary"
                  }`}>
                    {lang === "ko" ? "추천받기" : "Ask"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* ── Quick chips ── */}
          {results.length === 0 && !isLoading && (
            <View className="px-6 mb-6">
              <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs mb-3">
                {lang === "ko" ? "빠른 선택" : "Quick pick"}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {QUICK_CHIPS.map((chip) => (
                  <Pressable
                    key={chip.key}
                    className="bg-surface-secondary dark:bg-surface-dark-secondary border border-surface-border dark:border-surface-dark-border rounded-full px-4 py-2 flex-row items-center"
                    onPress={() => {
                      setPrompt(chip.prompt);
                      handleSubmit(chip.prompt);
                    }}
                  >
                    <Text className="text-sm mr-1.5">{chip.icon}</Text>
                    <Text className="text-text-secondary dark:text-text-dark-secondary text-sm">
                      {t(`recommend.${chip.key}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* ── Not enough reviews ── */}
          {notEnoughReviews && (
            <View className="mx-6 bg-surface-secondary dark:bg-surface-dark-secondary rounded-2xl p-6 border border-surface-border dark:border-surface-dark-border">
              <Text className="text-text-secondary dark:text-text-dark-secondary text-base text-center leading-6">
                {t("recommend.needMore")}
              </Text>
            </View>
          )}

          {/* ── Loading ── */}
          {isLoading && (
            <View className="px-6">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          )}

          {/* ── Error ── */}
          {error && (
            <View className="mx-6 bg-surface-secondary dark:bg-surface-dark-secondary rounded-2xl p-6 border border-surface-border dark:border-surface-dark-border">
              <Text className="text-text-secondary dark:text-text-dark-secondary text-base text-center">
                {t("recommend.error")}
              </Text>
            </View>
          )}

          {/* ── Results ── */}
          {results.length > 0 && (
            <View className="px-6">
              <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs uppercase tracking-widest mb-4">
                {lang === "ko" ? `추천 ${results.length}편` : `${results.length} picks`}
              </Text>

              {results.map((item, idx) => {
                const isExpanded = expandedIdx === idx;
                const accentColor = CATEGORY_ACCENT[item.category] ?? "#6B6560";

                return (
                  <Animated.View
                    key={idx}
                    entering={FadeInDown.delay(idx * 80).duration(350)}
                    className="mb-3"
                  >
                    <Pressable
                      className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-2xl overflow-hidden border border-surface-border dark:border-surface-dark-border"
                      onPress={() => setExpandedIdx(isExpanded ? null : idx)}
                    >
                      {/* Category accent strip */}
                      <View
                        className="h-0.5 w-full"
                        style={{ backgroundColor: accentColor }}
                      />

                      <View className="p-4">
                        {/* Category + expand toggle */}
                        <View className="flex-row items-center justify-between mb-2.5">
                          <View className="flex-row items-center">
                            <Text className="text-sm mr-1.5">
                              {CATEGORY_ICONS[item.category] ?? "📋"}
                            </Text>
                            <Text
                              className="text-xs font-medium"
                              style={{ color: accentColor }}
                            >
                              {item.category.toUpperCase()}
                            </Text>
                          </View>
                          <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs">
                            {isExpanded ? "▲" : "▼"}
                          </Text>
                        </View>

                        {/* Title */}
                        <Text className="text-text dark:text-text-dark text-lg font-bold leading-6 mb-1">
                          {item.title}
                        </Text>

                        {/* Creator + year */}
                        <Text className="text-text-tertiary dark:text-text-dark-tertiary text-sm mb-3">
                          {item.creator}
                          {item.year ? ` · ${item.year}` : ""}
                        </Text>

                        {/* Reason */}
                        <Animated.Text
                          key={isExpanded ? "expanded" : "collapsed"}
                          entering={FadeIn.duration(250)}
                          className="text-text-secondary dark:text-text-dark-secondary text-sm leading-6"
                        >
                          {isExpanded ? item.reason : item.reason_short}
                        </Animated.Text>
                      </View>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

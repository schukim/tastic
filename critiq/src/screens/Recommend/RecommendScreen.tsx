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
import Animated, { FadeInDown } from "react-native-reanimated";
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
  { key: "chipMovie", prompt: "영화 추천해줘" },
  { key: "chipBook", prompt: "책 추천해줘" },
  { key: "chipMusic", prompt: "음악 추천해줘" },
  { key: "chipNew", prompt: "새로운 장르 도전하고 싶어" },
];

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

  // Check auto-prompt from analysis tab
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

      // Save to DB
      saveRecommendation(user.id, queryPrompt.trim(), response.recommendations).catch(() => {});
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const notEnoughReviews = reviewCount !== null && reviewCount < 3;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-6 pt-8 pb-6"
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <Text className="text-text text-2xl font-bold mb-6">
            {t("recommend.title")}
          </Text>

          {/* Prompt input */}
          <View className="flex-row mb-4">
            <TextInput
              className="flex-1 bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3 text-text text-base mr-3"
              placeholder={t("recommend.placeholder")}
              placeholderTextColor="#94A3B8"
              value={prompt}
              onChangeText={setPrompt}
              editable={!isLoading}
            />
            <Pressable
              className={`rounded-xl px-5 justify-center ${
                prompt.trim() && !isLoading ? "bg-primary" : "bg-primary/40"
              }`}
              onPress={() => handleSubmit()}
              disabled={!prompt.trim() || isLoading}
            >
              <Text className="text-white font-semibold">→</Text>
            </Pressable>
          </View>

          {/* Quick chips */}
          {results.length === 0 && !isLoading && (
            <View className="flex-row flex-wrap mb-6">
              {QUICK_CHIPS.map((chip) => (
                <Pressable
                  key={chip.key}
                  className="bg-surface-tertiary rounded-full px-4 py-2 mr-2 mb-2"
                  onPress={() => {
                    setPrompt(chip.prompt);
                    handleSubmit(chip.prompt);
                  }}
                >
                  <Text className="text-text text-sm">{t(`recommend.${chip.key}`)}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Not enough reviews */}
          {notEnoughReviews && (
            <View className="bg-surface-secondary rounded-2xl p-6 items-center">
              <Text className="text-text-secondary text-base text-center">
                {t("recommend.needMore")}
              </Text>
            </View>
          )}

          {/* Loading */}
          {isLoading && (
            <View>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          )}

          {/* Error */}
          {error && (
            <View className="bg-surface-secondary rounded-2xl p-6 items-center">
              <Text className="text-text-secondary text-base text-center">
                {t("recommend.error")}
              </Text>
            </View>
          )}

          {/* Results */}
          {results.map((item, idx) => {
            const isExpanded = expandedIdx === idx;
            return (
              <Animated.View
                key={idx}
                entering={FadeInDown.delay(idx * 100).duration(300)}
              >
                <Pressable
                  className="bg-surface-secondary rounded-2xl p-4 mb-3 border border-surface-tertiary"
                  onPress={() => setExpandedIdx(isExpanded ? null : idx)}
                >
                  {/* Category badge */}
                  <View className="flex-row items-center mb-2">
                    <View className="bg-primary/10 px-2.5 py-0.5 rounded-full flex-row items-center">
                      <Text className="text-sm mr-1">
                        {CATEGORY_ICONS[item.category] ?? "📋"}
                      </Text>
                      <Text className="text-primary text-xs font-medium">{item.category}</Text>
                    </View>
                  </View>

                  {/* Title */}
                  <Text className="text-text text-base font-semibold mb-1">{item.title}</Text>

                  {/* Creator + year */}
                  <Text className="text-text-secondary text-sm mb-2">
                    {item.creator}
                    {item.year ? ` · ${item.year}` : ""}
                  </Text>

                  {/* Reason */}
                  <Text className="text-text-secondary text-sm leading-5">
                    {isExpanded ? item.reason : item.reason_short}
                  </Text>

                  {/* Expand indicator */}
                  <Text className="text-text-tertiary text-xs mt-2 text-right">
                    {isExpanded ? "△" : "▽"}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

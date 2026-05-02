import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { ReviewStackParamList } from "../../types/navigation";
import type { ContentCandidate } from "../../types/llm";
import type { ContentCategory } from "../../types/database";
import { verifyContent } from "../../services/claude";
import { createContent } from "../../services/content";
import { SkeletonCard } from "../../components/common/SkeletonCard";
import { CATEGORY_ICONS } from "../../components/common/CategoryChip";
import { useAuthStore } from "../../stores/authStore";

type Nav = NativeStackNavigationProp<ReviewStackParamList, "ContentConfirm">;
type Route = RouteProp<ReviewStackParamList, "ContentConfirm">;

const EXHIBITION_PERFORMANCE: ContentCategory[] = ["exhibition", "performance"];

export function ContentConfirmScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const user = useAuthStore((s) => s.user);

  const { title, creator: inputCreator, category, experienceDate } = route.params;

  const [candidates, setCandidates] = useState<ContentCandidate[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualCreator, setManualCreator] = useState(inputCreator);
  const [manualYear, setManualYear] = useState("");

  // Show manual input first for exhibition/performance
  const showManualFirst = EXHIBITION_PERFORMANCE.includes(category);

  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const response = await verifyContent({
        title,
        creator: inputCreator || undefined,
        category,
        language: user?.language ?? "ko",
      });
      setCandidates(response.candidates);

      // Auto-select if single high-confidence result
      if (response.candidates.length === 1 && response.candidates[0].confidence === "high") {
        setSelectedIndex(0);
      }
    } catch (e) {
      console.error("verifyContent error:", e);
      setFetchError(e instanceof Error ? e.message : "작품 검색 중 오류가 발생했습니다.");
      setCandidates([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNext = async () => {
    if (!user) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      let contentData;
      if (isManualMode) {
        contentData = await createContent({
          userId: user.id,
          title,
          category,
          creator: manualCreator || undefined,
          year: manualYear ? parseInt(manualYear, 10) : undefined,
        });
      } else if (selectedIndex !== null) {
        const candidate = candidates[selectedIndex];
        contentData = await createContent({
          userId: user.id,
          title: candidate.title,
          originalTitle: candidate.original_title ?? undefined,
          category,
          creator: candidate.creator ?? undefined,
          year: candidate.year ?? undefined,
          genre: candidate.genre ?? undefined,
          metadata: candidate.metadata,
        });
      } else {
        return;
      }
      navigation.navigate("Interview", { content: contentData });
    } catch (e) {
      console.error("handleNext error:", e);
      setSaveError(e instanceof Error ? e.message : "작품 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const isValid = isManualMode || selectedIndex !== null;

  const confidenceColor = (conf: string) => {
    if (conf === "high") return "bg-success/20 text-success";
    if (conf === "medium") return "bg-yellow-100 text-yellow-700";
    return "bg-surface-tertiary text-text-secondary";
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView className="flex-1 px-6 pt-8" contentContainerClassName="pb-8">
        {/* Header */}
        <Text className="text-text text-2xl font-bold mb-2">{t("review.confirm.title")}</Text>
        <Text className="text-text-secondary text-sm mb-6">
          {CATEGORY_ICONS[category]} {title}
        </Text>

        {/* Manual input option (first for exhibition/performance) */}
        {showManualFirst && !isLoading && (
          <Pressable
            className={`border rounded-2xl p-4 mb-3 ${
              isManualMode ? "border-primary bg-primary/5" : "border-surface-tertiary"
            }`}
            onPress={() => { setIsManualMode(true); setSelectedIndex(null); }}
          >
            <Text className="text-text font-medium">{t("review.confirm.manualInputFirst")}</Text>
          </Pressable>
        )}

        {/* Fetch error */}
        {fetchError && !isLoading && (
          <View className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-3">
            <Text className="text-red-600 text-sm mb-2">{fetchError}</Text>
            <Pressable onPress={fetchCandidates}>
              <Text className="text-primary text-sm font-medium">다시 시도</Text>
            </Pressable>
          </View>
        )}

        {/* Loading */}
        {isLoading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {/* Candidate cards */}
        {!isLoading && candidates.map((candidate, index) => (
          <Pressable
            key={index}
            className={`border rounded-2xl p-4 mb-3 ${
              selectedIndex === index && !isManualMode
                ? "border-primary bg-primary/5"
                : "border-surface-tertiary"
            }`}
            onPress={() => { setSelectedIndex(index); setIsManualMode(false); }}
          >
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-text text-base font-semibold flex-1">{candidate.title}</Text>
              <View className={`px-2 py-0.5 rounded-full ${confidenceColor(candidate.confidence)}`}>
                <Text className="text-xs font-medium">{candidate.confidence}</Text>
              </View>
            </View>
            {candidate.creator && (
              <Text className="text-text-secondary text-sm">{candidate.creator}</Text>
            )}
            <View className="flex-row mt-1">
              {candidate.year && (
                <Text className="text-text-tertiary text-xs mr-3">{candidate.year}</Text>
              )}
              {candidate.genre && (
                <Text className="text-text-tertiary text-xs">{candidate.genre}</Text>
              )}
            </View>
          </Pressable>
        ))}

        {/* No results or manual input */}
        {!isLoading && candidates.length === 0 && !showManualFirst && (
          <Pressable
            className="border border-dashed border-text-tertiary rounded-2xl p-4 mb-3 items-center"
            onPress={() => setIsManualMode(true)}
          >
            <Text className="text-text-secondary text-sm">{t("review.confirm.manualInput")}</Text>
          </Pressable>
        )}

        {/* Manual input bottom option (for non-exhibition) */}
        {!isLoading && candidates.length > 0 && !showManualFirst && (
          <Pressable
            className={`border border-dashed rounded-2xl p-4 mb-3 items-center ${
              isManualMode ? "border-primary" : "border-text-tertiary"
            }`}
            onPress={() => { setIsManualMode(true); setSelectedIndex(null); }}
          >
            <Text className="text-text-secondary text-sm">{t("review.confirm.manualInput")}</Text>
          </Pressable>
        )}

        {/* Manual input fields */}
        {isManualMode && (
          <View className="mt-2 mb-4">
            <TextInput
              className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3 text-text text-sm mb-3"
              placeholder={user?.language === "en" ? "Creator (optional)" : "창작자 (선택)"}
              placeholderTextColor="#94A3B8"
              value={manualCreator}
              onChangeText={setManualCreator}
            />
            <TextInput
              className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3 text-text text-sm"
              placeholder={user?.language === "en" ? "Year (optional)" : "연도 (선택)"}
              placeholderTextColor="#94A3B8"
              value={manualYear}
              onChangeText={setManualYear}
              keyboardType="number-pad"
            />
          </View>
        )}
      </ScrollView>

      {/* Bottom button */}
      <View className="px-6 pb-6">
        {saveError && (
          <Text className="text-red-500 text-sm text-center mb-3">{saveError}</Text>
        )}
        <Pressable
          className={`rounded-xl py-4 items-center ${isValid && !isSaving ? "bg-primary" : "bg-primary/40"}`}
          onPress={handleNext}
          disabled={!isValid || isSaving}
        >
          <Text className="text-white font-semibold text-base">
            {isSaving ? "저장 중..." : t("review.next")}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

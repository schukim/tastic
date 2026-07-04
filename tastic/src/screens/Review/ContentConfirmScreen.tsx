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
import { verifyContent } from "../../services/claude";
import { createContent } from "../../services/content";
import { saveVerifiedWork } from "../../services/work";
import { SkeletonCard } from "../../components/common/SkeletonCard";
import { CATEGORY_ICONS } from "../../components/common/CategoryChip";
import { useAuthStore } from "../../stores/authStore";

type Nav = NativeStackNavigationProp<ReviewStackParamList, "ContentConfirm">;
type Route = RouteProp<ReviewStackParamList, "ContentConfirm">;

export function ContentConfirmScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const user = useAuthStore((s) => s.user);

  const { title, creator: inputCreator, category, musicType } = route.params;

  const [candidates, setCandidates] = useState<ContentCandidate[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualCreator, setManualCreator] = useState(inputCreator);
  const [manualYear, setManualYear] = useState("");
  // 결과가 글로벌 캐시에서 왔는지 — true일 때만 '재검색' 버튼 노출
  const [cacheHit, setCacheHit] = useState(false);
  // 재검색은 플랜 무관 세션당 최대 3회
  const MAX_RESEARCH = 3;
  const [researchCount, setResearchCount] = useState(0);

  useEffect(() => {
    fetchCandidates();
  }, []);

  // skipCache=true면 캐시를 건너뛰고 웹서치 강제('재검색')
  const fetchCandidates = async (skipCache = false) => {
    if (skipCache) {
      if (researchCount >= MAX_RESEARCH) return;
      setResearchCount((c) => c + 1);
    }
    setIsLoading(true);
    setFetchError(null);
    setSelectedIndex(null);
    try {
      const response = await verifyContent({
        title,
        creator: inputCreator || undefined,
        category,
        language: user?.language ?? "ko",
        skipCache,
      });
      setCandidates(response.candidates);
      setCacheHit(response._debug?.cache_hit === true);

      // 웹서칭 출처 확인용 — 브라우저 콘솔에 실제 인용 도메인/URL을 찍는다(테스트 전용).
      if (response._debug) {
        const d = response._debug;
        console.log(
          `[verify-content] "${title}" — 검색 ${d.search_count}회 / ${d.ms}ms / 출처 도메인:`,
          d.cited_domains
        );
        // Hermes 등 console.table 미지원 런타임에서 크래시하지 않도록 가드
        console.table?.(d.citations);
      }

      // Auto-select if single high-confidence result
      if (response.candidates.length === 1 && response.candidates[0].confidence === "high") {
        setSelectedIndex(0);
      }
    } catch (e) {
      console.error("verifyContent error:", e);
      setFetchError(e instanceof Error ? e.message : t("review.confirm.searchError"));
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
      const musicMeta = musicType ? { music_type: musicType } : {};
      if (isManualMode) {
        contentData = await createContent({
          userId: user.id,
          title,
          category,
          creator: manualCreator || undefined,
          year: manualYear ? parseInt(manualYear, 10) : undefined,
          metadata: musicMeta,
        });
      } else if (selectedIndex !== null) {
        const candidate = candidates[selectedIndex];
        // 후보를 확정하면 is_verified=true로 승격해 전역 캐시로 공유 (service-role 엣지 함수)
        contentData = await saveVerifiedWork({
          title: candidate.title,
          originalTitle: candidate.original_title ?? undefined,
          category,
          creator: candidate.creator ?? undefined,
          year: candidate.year ?? undefined,
          genre: candidate.genre ?? undefined,
          metadata: { ...candidate.metadata, ...musicMeta },
        });
      } else {
        return;
      }
      navigation.navigate("Interview", { content: contentData });
    } catch (e) {
      console.error("handleNext error:", e);
      setSaveError(e instanceof Error ? e.message : t("review.confirm.saveError"));
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
        <Text className="text-text-secondary text-[15px] mb-6">
          {CATEGORY_ICONS[category]} {title}
        </Text>

        {/* Fetch error */}
        {fetchError && !isLoading && (
          <View className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-3">
            <Text className="text-red-600 text-[15px] mb-2">{fetchError}</Text>
            <Pressable onPress={() => fetchCandidates()}>
              <Text className="text-primary text-[15px] font-medium">{t("common.retry")}</Text>
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
                <Text className="text-[13px] font-medium">{candidate.confidence}</Text>
              </View>
            </View>
            {candidate.creator && (
              <Text className="text-text-secondary text-[15px]">{candidate.creator}</Text>
            )}
            <View className="flex-row mt-1">
              {candidate.year && (
                <Text className="text-text-tertiary text-[13px] mr-3">{candidate.year}</Text>
              )}
              {candidate.genre && (
                <Text className="text-text-tertiary text-[13px]">{candidate.genre}</Text>
              )}
            </View>
          </Pressable>
        ))}

        {/* 재검색: 캐시에서 온 결과일 때만 노출. 웹서치 결과에는 표시 안 함. 세션당 최대 3회 */}
        {!isLoading && cacheHit && candidates.length > 0 && researchCount < MAX_RESEARCH && (
          <Pressable
            className="border border-primary/40 rounded-2xl p-4 mb-3 items-center"
            onPress={() => fetchCandidates(true)}
          >
            <Text className="text-primary text-[15px] font-medium">
              🔍 {t("review.confirm.research")}
            </Text>
          </Pressable>
        )}

        {/* No results: 재검색(최대 3회) + manual input */}
        {!isLoading && candidates.length === 0 && (
          <>
            {researchCount < MAX_RESEARCH ? (
              <Pressable
                className="border border-primary/40 rounded-2xl p-4 mb-3 items-center"
                onPress={() => fetchCandidates(true)}
              >
                <Text className="text-primary text-[15px] font-medium">
                  🔍 {t("review.confirm.research")}
                </Text>
              </Pressable>
            ) : (
              <Text className="text-text-tertiary text-[13px] text-center mb-3">
                {t("review.confirm.researchLimit")}
              </Text>
            )}
            <Pressable
              className="border border-dashed border-text-tertiary rounded-2xl p-4 mb-3 items-center"
              onPress={() => setIsManualMode(true)}
            >
              <Text className="text-text-secondary text-[15px]">{t("review.confirm.manualInput")}</Text>
            </Pressable>
          </>
        )}

        {/* Manual input */}
        {!isLoading && candidates.length > 0 && (
          <Pressable
            className={`border border-dashed rounded-2xl p-4 mb-3 items-center ${
              isManualMode ? "border-primary" : "border-text-tertiary"
            }`}
            onPress={() => { setIsManualMode(true); setSelectedIndex(null); }}
          >
            <Text className="text-text-secondary text-[15px]">{t("review.confirm.manualInput")}</Text>
          </Pressable>
        )}

        {/* Manual input fields */}
        {isManualMode && (
          <View className="mt-2 mb-4">
            <TextInput
              className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3 text-text text-[15px] mb-3"
              placeholder={t("review.confirm.creatorOptional")}
              placeholderTextColor="#94A3B8"
              value={manualCreator}
              onChangeText={setManualCreator}
            />
            <TextInput
              className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3 text-text text-[15px]"
              placeholder={t("review.confirm.yearOptional")}
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
          <Text className="text-red-500 text-[15px] text-center mb-3">{saveError}</Text>
        )}
        <Pressable
          className={`rounded-xl py-4 items-center ${isValid && !isSaving ? "bg-primary" : "bg-primary/40"}`}
          onPress={handleNext}
          disabled={!isValid || isSaving}
        >
          <Text className="text-white font-semibold text-base">
            {isSaving ? t("common.saving") : t("review.next")}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

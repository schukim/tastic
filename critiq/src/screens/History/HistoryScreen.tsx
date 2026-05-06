import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Modal,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import { useAuthStore } from "../../stores/authStore";
import {
  fetchReviewsByMonth,
  updateReview,
  type ReviewWithContent,
} from "../../services/review";
import { CATEGORY_ICONS } from "../../components/common/CategoryChip";
import { formatRelativeDate } from "../../utils/formatDate";
import type { ContentCategory } from "../../types/database";

const CATEGORY_COLORS: Record<string, string> = {
  movie:       "#5C2E2E",
  music:       "#2E3D4F",
  book:        "#3D4A2E",
  art:         "#5C4A2E",
  exhibition:  "#3D2E4A",
  performance: "#5C3D2E",
};

const CATEGORY_BG: Record<string, string> = {
  movie:       "#5C2E2E18",
  music:       "#2E3D4F18",
  book:        "#3D4A2E18",
  art:         "#5C4A2E18",
  exhibition:  "#3D2E4A18",
  performance: "#5C3D2E18",
};

const DAYS_OF_WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"];
const DAYS_OF_WEEK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

function formatReadableDate(dateStr: string, lang: string) {
  const d = new Date(dateStr);
  if (lang === "ko") {
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
  }
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function HistoryScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const lang = user?.language ?? "ko";

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [reviews, setReviews] = useState<ReviewWithContent[]>([]);
  const [selectedReview, setSelectedReview] = useState<ReviewWithContent | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchReviewsByMonth(user.id, year, month);
      setReviews(data);
    } catch {
      setReviews([]);
    }
  }, [user, year, month]);

  useFocusEffect(
    useCallback(() => {
      loadReviews();
    }, [loadReviews])
  );

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const reviewsByDay: Record<number, string[]> = {};
  reviews.forEach((r) => {
    const day = new Date(r.created_at).getDate();
    if (!reviewsByDay[day]) reviewsByDay[day] = [];
    const cat = r.contents?.category;
    if (cat && !reviewsByDay[day].includes(cat)) {
      reviewsByDay[day].push(cat);
    }
  });

  const reviewsForDay = (day: number) =>
    reviews.filter((r) => new Date(r.created_at).getDate() === day);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const today = now.getDate();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const daysOfWeek = lang === "ko" ? DAYS_OF_WEEK_KO : DAYS_OF_WEEK_EN;

  const handleDayPress = (day: number) => {
    const dayReviews = reviewsForDay(day);
    if (dayReviews.length > 0) {
      setSelectedReview(dayReviews[0]);
    }
  };

  const handleEdit = () => {
    if (!selectedReview) return;
    setEditText(selectedReview.body);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedReview) return;
    try {
      await updateReview(selectedReview.id, editText);
      setSelectedReview({ ...selectedReview, body: editText });
      setIsEditing(false);
      showToast(lang === "ko" ? "수정되었습니다" : "Updated");
      loadReviews();
    } catch {
      showToast(lang === "ko" ? "수정에 실패했습니다" : "Update failed");
    }
  };

  const handleCopy = async () => {
    if (!selectedReview) return;
    await Clipboard.setStringAsync(selectedReview.body);
    showToast(t("common.copied"));
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  const selectedCategory = selectedReview?.contents?.category ?? "movie";
  const accentColor = CATEGORY_COLORS[selectedCategory] ?? "#6B6560";
  const accentBg = CATEGORY_BG[selectedCategory] ?? "#6B656018";

  return (
    <SafeAreaView className="flex-1 bg-surface dark:bg-surface-dark">

      {/* ── Calendar ── */}
      <View className="px-4 pt-4 pb-2">
        {/* Month header */}
        <View className="flex-row items-center justify-between mb-4">
          <Pressable onPress={prevMonth} className="p-2">
            <Text className="text-text dark:text-text-dark text-lg">←</Text>
          </Pressable>
          <Text className="text-text dark:text-text-dark text-lg font-bold">
            {lang === "ko"
              ? `${year}년 ${month}월`
              : `${new Date(year, month - 1).toLocaleString("en", { month: "long" })} ${year}`}
          </Text>
          <Pressable onPress={nextMonth} className="p-2">
            <Text className="text-text dark:text-text-dark text-lg">→</Text>
          </Pressable>
        </View>

        {/* Day of week headers */}
        <View className="flex-row mb-2">
          {daysOfWeek.map((d) => (
            <View key={d} className="flex-1 items-center">
              <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs">{d}</Text>
            </View>
          ))}
        </View>

        {/* Calendar grid */}
        <View className="flex-row flex-wrap">
          {calendarCells.map((day, idx) => {
            const dots = day ? reviewsByDay[day] ?? [] : [];
            const isToday = isCurrentMonth && day === today;
            const hasDots = dots.length > 0;

            return (
              <Pressable
                key={idx}
                className="items-center justify-center"
                style={{ width: "14.28%", height: 44 }}
                onPress={() => day && hasDots && handleDayPress(day)}
                disabled={!day || !hasDots}
              >
                {day && (
                  <>
                    <View
                      className={`w-7 h-7 items-center justify-center rounded-full ${
                        isToday ? "bg-text dark:bg-primary-dm" : ""
                      }`}
                    >
                      <Text
                        className={`text-sm ${
                          isToday
                            ? "text-surface dark:text-surface-dark font-bold"
                            : hasDots
                            ? "text-text dark:text-text-dark font-medium"
                            : "text-text-tertiary dark:text-text-dark-tertiary"
                        }`}
                      >
                        {day}
                      </Text>
                    </View>
                    {hasDots && (
                      <View className="flex-row mt-0.5 gap-0.5">
                        {dots.slice(0, 3).map((cat, i) => (
                          <View
                            key={i}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: CATEGORY_COLORS[cat] ?? "#9C9589" }}
                          />
                        ))}
                        {dots.length > 3 && (
                          <Text className="text-text-tertiary dark:text-text-dark-tertiary" style={{ fontSize: 6 }}>
                            +{dots.length - 3}
                          </Text>
                        )}
                      </View>
                    )}
                  </>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Divider */}
      <View className="h-px bg-surface-tertiary dark:bg-surface-dark-tertiary mx-4 mb-1" />

      {/* ── Review List ── */}
      {reviews.length === 0 ? (
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-text-tertiary dark:text-text-dark-tertiary text-base">
            {t("history.empty")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
          renderItem={({ item }) => {
            const cat = item.contents?.category ?? "movie";
            const color = CATEGORY_COLORS[cat] ?? "#6B6560";
            const bg = CATEGORY_BG[cat] ?? "#6B656018";
            return (
              <Pressable
                className="flex-row items-center py-3.5 border-b border-surface-tertiary dark:border-surface-dark-tertiary"
                onPress={() => setSelectedReview(item)}
              >
                <View
                  className="w-9 h-9 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: bg }}
                >
                  <Text className="text-base">
                    {CATEGORY_ICONS[cat as ContentCategory] ?? "📋"}
                  </Text>
                </View>
                <View className="flex-1 mr-2">
                  <Text
                    className="text-text dark:text-text-dark text-base font-medium leading-5"
                    numberOfLines={1}
                  >
                    {item.contents?.title ?? item.title ?? ""}
                  </Text>
                  <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs mt-0.5">
                    {item.experience_date ?? item.created_at.split("T")[0]}
                  </Text>
                </View>
                <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs">
                  {formatRelativeDate(item.created_at, lang)}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      {/* ── Review Detail Bottom Sheet ── */}
      <Modal
        visible={!!selectedReview}
        transparent
        animationType="slide"
        onRequestClose={() => { setSelectedReview(null); setIsEditing(false); }}
      >
        <Pressable
          className="flex-1 bg-dim"
          onPress={() => { setSelectedReview(null); setIsEditing(false); }}
        >
          <View className="flex-1" />
          <Pressable
            className="bg-surface dark:bg-surface-dark rounded-t-3xl"
            style={{ maxHeight: "88%" }}
            onPress={(e) => e.stopPropagation()}
          >
            {selectedReview && (
              <Animated.View entering={SlideInDown.duration(300)} className="flex-1">
                {/* Category color strip */}
                <View
                  className="h-1 rounded-t-3xl"
                  style={{ backgroundColor: accentColor }}
                />

                {/* Drag handle */}
                <View className="pt-3 pb-1 items-center">
                  <View className="w-10 h-1 bg-surface-tertiary dark:bg-surface-dark-tertiary rounded-full" />
                </View>

                {/* Header */}
                <View className="px-6 pt-4 pb-4">
                  {/* Category badge + date */}
                  <View className="flex-row items-center justify-between mb-4">
                    <View
                      className="flex-row items-center rounded-full px-3 py-1"
                      style={{ backgroundColor: accentBg }}
                    >
                      <Text className="text-sm mr-1.5">
                        {CATEGORY_ICONS[selectedCategory as ContentCategory] ?? "📋"}
                      </Text>
                      <Text
                        className="text-xs font-semibold uppercase tracking-wide"
                        style={{ color: accentColor }}
                      >
                        {selectedCategory}
                      </Text>
                    </View>
                    <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs">
                      {formatReadableDate(
                        selectedReview.experience_date ?? selectedReview.created_at,
                        lang
                      )}
                    </Text>
                  </View>

                  {/* Title */}
                  <Text className="text-text dark:text-text-dark text-2xl font-bold leading-8 mb-1">
                    {selectedReview.contents?.title ?? ""}
                  </Text>
                  {selectedReview.contents?.creator && (
                    <Text className="text-text-secondary dark:text-text-dark-secondary text-sm">
                      {selectedReview.contents.creator}
                    </Text>
                  )}
                </View>

                {/* Divider */}
                <View className="h-px bg-surface-tertiary dark:bg-surface-dark-tertiary mx-6 mb-4" />

                {/* Review body */}
                <ScrollView
                  className="flex-1 px-6"
                  showsVerticalScrollIndicator={false}
                  style={{ maxHeight: 280 }}
                >
                  {isEditing ? (
                    <TextInput
                      className="text-text dark:text-text-dark text-base leading-8"
                      value={editText}
                      onChangeText={setEditText}
                      multiline
                      autoFocus
                      textAlignVertical="top"
                      style={{ minHeight: 200 }}
                    />
                  ) : (
                    <Text className="text-text dark:text-text-dark text-base leading-8 pb-4">
                      {selectedReview.body}
                    </Text>
                  )}
                </ScrollView>

                {/* Actions */}
                <View className="px-6 pt-4 pb-6">
                  <View className="h-px bg-surface-tertiary dark:bg-surface-dark-tertiary mb-4" />
                  {isEditing ? (
                    <View className="flex-row gap-3">
                      <Pressable
                        className="flex-1 bg-surface-tertiary dark:bg-surface-dark-tertiary rounded-2xl py-3.5 items-center"
                        onPress={() => setIsEditing(false)}
                      >
                        <Text className="text-text dark:text-text-dark font-medium">
                          {t("common.cancel")}
                        </Text>
                      </Pressable>
                      <Pressable
                        className="flex-1 bg-text dark:bg-primary-dm rounded-2xl py-3.5 items-center"
                        onPress={handleSaveEdit}
                      >
                        <Text className="text-surface dark:text-surface-dark font-semibold">
                          {t("common.save")}
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View className="flex-row gap-3">
                      <Pressable
                        className="flex-1 bg-surface-secondary dark:bg-surface-dark-secondary border border-surface-border dark:border-surface-dark-border rounded-2xl py-3.5 items-center"
                        onPress={handleEdit}
                      >
                        <Text className="text-text dark:text-text-dark font-medium">
                          {t("common.edit")}
                        </Text>
                      </Pressable>
                      <Pressable
                        className="flex-1 bg-surface-secondary dark:bg-surface-dark-secondary border border-surface-border dark:border-surface-dark-border rounded-2xl py-3.5 items-center"
                        onPress={handleCopy}
                      >
                        <Text className="text-text dark:text-text-dark font-medium">
                          {lang === "ko" ? "복사" : "Copy"}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </Animated.View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Toast */}
      {toastMessage && (
        <Animated.View
          entering={FadeIn}
          className="absolute bottom-24 self-center bg-text/80 dark:bg-text-dark/80 px-5 py-2.5 rounded-full"
        >
          <Text className="text-surface dark:text-surface-dark text-sm">{toastMessage}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

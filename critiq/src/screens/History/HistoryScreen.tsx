import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Modal,
  TextInput,
  ScrollView,
  Alert,
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
  movie: "#EF4444",
  music: "#3B82F6",
  book: "#22C55E",
  art: "#EAB308",
  exhibition: "#A855F7",
  performance: "#EC4899",
};

const DAYS_OF_WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"];
const DAYS_OF_WEEK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
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

  // Group reviews by day for calendar dots
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
    if (dayReviews.length === 1) {
      setSelectedReview(dayReviews[0]);
    } else if (dayReviews.length > 1) {
      // Show first one for now; could show a picker
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

  // ── Calendar Grid ──
  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* ── Calendar ── */}
      <View className="px-4 pt-4 pb-2">
        {/* Month header */}
        <View className="flex-row items-center justify-between mb-4">
          <Pressable onPress={prevMonth} className="p-2">
            <Text className="text-text text-lg">←</Text>
          </Pressable>
          <Text className="text-text text-lg font-bold">
            {lang === "ko" ? `${year}년 ${month}월` : `${new Date(year, month - 1).toLocaleString("en", { month: "long" })} ${year}`}
          </Text>
          <Pressable onPress={nextMonth} className="p-2">
            <Text className="text-text text-lg">→</Text>
          </Pressable>
        </View>

        {/* Day of week headers */}
        <View className="flex-row mb-2">
          {daysOfWeek.map((d) => (
            <View key={d} className="flex-1 items-center">
              <Text className="text-text-tertiary text-xs">{d}</Text>
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
                    <View className={`w-7 h-7 items-center justify-center rounded-full ${isToday ? "bg-primary" : ""}`}>
                      <Text className={`text-sm ${isToday ? "text-white font-bold" : hasDots ? "text-text font-medium" : "text-text-tertiary"}`}>
                        {day}
                      </Text>
                    </View>
                    {dots.length > 0 && (
                      <View className="flex-row mt-0.5 gap-0.5">
                        {dots.slice(0, 3).map((cat, i) => (
                          <View
                            key={i}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: CATEGORY_COLORS[cat] ?? "#94A3B8" }}
                          />
                        ))}
                        {dots.length > 3 && (
                          <Text className="text-text-tertiary" style={{ fontSize: 6 }}>+{dots.length - 3}</Text>
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
      <View className="h-px bg-surface-tertiary mx-4" />

      {/* ── Review List ── */}
      {reviews.length === 0 ? (
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-text-secondary text-base">{t("history.empty")}</Text>
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
          renderItem={({ item }) => (
            <Pressable
              className="flex-row items-center py-3 border-b border-surface-tertiary"
              onPress={() => setSelectedReview(item)}
            >
              <View
                className="w-9 h-9 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: (CATEGORY_COLORS[item.contents?.category] ?? "#94A3B8") + "20" }}
              >
                <Text className="text-base">
                  {CATEGORY_ICONS[item.contents?.category as ContentCategory] ?? "📋"}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-text text-base font-medium" numberOfLines={1}>
                  {item.contents?.title ?? item.title ?? ""}
                </Text>
                <Text className="text-text-tertiary text-xs mt-0.5">
                  {item.experience_date ?? item.created_at.split("T")[0]}
                </Text>
              </View>
              <Text className="text-text-tertiary text-xs">
                {formatRelativeDate(item.created_at, lang)}
              </Text>
            </Pressable>
          )}
        />
      )}

      {/* ── Review Popup (Bottom Sheet) ── */}
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
            className="bg-surface rounded-t-3xl"
            style={{ maxHeight: "85%" }}
            onPress={(e) => e.stopPropagation()}
          >
            <Animated.View entering={SlideInDown.duration(300)} className="p-6">
              {/* Handle bar */}
              <View className="w-10 h-1 bg-surface-tertiary rounded-full self-center mb-4" />

              {/* Header */}
              {selectedReview && (
                <View className="flex-row items-center mb-4">
                  <Text className="text-lg mr-2">
                    {CATEGORY_ICONS[selectedReview.contents?.category as ContentCategory] ?? "📋"}
                  </Text>
                  <View className="flex-1">
                    <Text className="text-text text-lg font-bold">
                      {selectedReview.contents?.title ?? ""}
                    </Text>
                    <Text className="text-text-tertiary text-xs">
                      {selectedReview.experience_date ?? selectedReview.created_at.split("T")[0]}
                    </Text>
                  </View>
                </View>
              )}

              {/* Body */}
              <ScrollView style={{ maxHeight: 350 }} className="mb-4">
                {isEditing ? (
                  <TextInput
                    className="text-text text-base leading-7"
                    value={editText}
                    onChangeText={setEditText}
                    multiline
                    autoFocus
                    textAlignVertical="top"
                  />
                ) : (
                  <Text className="text-text text-base leading-7">
                    {selectedReview?.body}
                  </Text>
                )}
              </ScrollView>

              {/* Actions */}
              <View className="flex-row gap-3">
                {isEditing ? (
                  <>
                    <Pressable
                      className="flex-1 bg-surface-tertiary rounded-xl py-3 items-center"
                      onPress={() => setIsEditing(false)}
                    >
                      <Text className="text-text font-medium">{t("common.cancel")}</Text>
                    </Pressable>
                    <Pressable
                      className="flex-1 bg-primary rounded-xl py-3 items-center"
                      onPress={handleSaveEdit}
                    >
                      <Text className="text-white font-medium">{t("common.save")}</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      className="flex-1 bg-surface-tertiary rounded-xl py-3 items-center flex-row justify-center"
                      onPress={handleEdit}
                    >
                      <Text className="text-text font-medium">{t("common.edit")}</Text>
                    </Pressable>
                    <Pressable
                      className="flex-1 bg-surface-tertiary rounded-xl py-3 items-center flex-row justify-center"
                      onPress={handleCopy}
                    >
                      <Text className="text-text font-medium">{t("common.copied").replace("습니다", "")}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Toast */}
      {toastMessage && (
        <Animated.View
          entering={FadeIn}
          className="absolute bottom-24 self-center bg-text/80 px-5 py-2.5 rounded-full"
        >
          <Text className="text-white text-sm">{toastMessage}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

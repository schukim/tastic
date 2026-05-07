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
import Animated, { FadeIn, FadeInDown, SlideInDown } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
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
  const { isDark } = useTheme();
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
    <SafeAreaView className={`flex-1 ${isDark ? 'dark' : ''}`} style={{ backgroundColor: isDark ? '#1A1814' : '#F8F6F1' }}>

      {/* ── Enhanced Calendar ── */}
      <View className="px-5 pt-6 pb-4">
        {/* Elegant Month header */}
        <View className="flex-row items-center justify-between mb-6">
          <Pressable
            onPress={prevMonth}
            className="w-10 h-10 items-center justify-center rounded-2xl bg-surface-secondary dark:bg-surface-dark-secondary border border-surface-border/50 dark:border-surface-dark-border/50"
          >
            <Text className="text-text dark:text-text-dark text-lg font-light">←</Text>
          </Pressable>
          <View className="items-center">
            <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs uppercase tracking-widest font-medium">
              {lang === "ko" ? "기록" : "History"}
            </Text>
            <Text className="text-text dark:text-text-dark text-xl font-bold mt-1">
              {lang === "ko"
                ? `${year}년 ${month}월`
                : `${new Date(year, month - 1).toLocaleString("en", { month: "long" })} ${year}`}
            </Text>
          </View>
          <Pressable
            onPress={nextMonth}
            className="w-10 h-10 items-center justify-center rounded-2xl bg-surface-secondary dark:bg-surface-dark-secondary border border-surface-border/50 dark:border-surface-dark-border/50"
          >
            <Text className="text-text dark:text-text-dark text-lg font-light">→</Text>
          </Pressable>
        </View>

        {/* Refined Day of week headers */}
        <View className="flex-row mb-3 px-1">
          {daysOfWeek.map((d) => (
            <View key={d} className="flex-1 items-center">
              <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs font-medium uppercase tracking-wider">{d}</Text>
            </View>
          ))}
        </View>

        {/* Enhanced Calendar grid */}
        <View className="flex-row flex-wrap px-1">
          {calendarCells.map((day, idx) => {
            const dots = day ? reviewsByDay[day] ?? [] : [];
            const isToday = isCurrentMonth && day === today;
            const hasDots = dots.length > 0;

            return (
              <Pressable
                key={idx}
                className={`items-center justify-center rounded-2xl transition-all ${
                  day && hasDots ? 'active:scale-95' : ''
                }`}
                style={{ width: "14.28%", height: 50 }}
                onPress={() => day && hasDots && handleDayPress(day)}
                disabled={!day || !hasDots}
              >
                {day && (
                  <>
                    <View
                      className={`w-8 h-8 items-center justify-center rounded-2xl transition-all ${
                        isToday
                          ? "bg-text dark:bg-primary-dm shadow-lg"
                          : hasDots
                          ? "bg-surface-secondary dark:bg-surface-dark-secondary border border-surface-border/30 dark:border-surface-dark-border/30"
                          : ""
                      }`}
                    >
                      <Text
                        className={`text-sm transition-colors ${
                          isToday
                            ? "text-surface dark:text-surface-dark font-bold"
                            : hasDots
                            ? "text-text dark:text-text-dark font-semibold"
                            : "text-text-tertiary dark:text-text-dark-tertiary"
                        }`}
                      >
                        {day}
                      </Text>
                    </View>
                    {hasDots && (
                      <View className="flex-row mt-1 gap-1">
                        {dots.slice(0, 3).map((cat, i) => (
                          <View
                            key={i}
                            className="w-2 h-2 rounded-full shadow-sm"
                            style={{ backgroundColor: isDark ? CATEGORY_COLORS[cat] + '80' : CATEGORY_COLORS[cat] }}
                          />
                        ))}
                        {dots.length > 3 && (
                          <Text className="text-text-tertiary dark:text-text-dark-tertiary font-bold" style={{ fontSize: 7 }}>
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

      {/* Elegant Divider */}
      <View className="mx-5 mb-2 flex-row items-center">
        <View className="flex-1 h-px bg-gradient-to-r from-transparent via-surface-border dark:via-surface-dark-border to-transparent" />
        <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs mx-4 uppercase tracking-widest font-medium">
          {reviews.length > 0 ? `${reviews.length}편` : '기록'}
        </Text>
        <View className="flex-1 h-px bg-gradient-to-r from-transparent via-surface-border dark:via-surface-dark-border to-transparent" />
      </View>

      {/* ── Enhanced Review List ── */}
      {reviews.length === 0 ? (
        <View className="flex-1 justify-center items-center px-8">
          <View className="w-16 h-16 rounded-3xl bg-surface-tertiary dark:bg-surface-dark-secondary items-center justify-center mb-4">
            <Text className="text-3xl opacity-50">📚</Text>
          </View>
          <Text className="text-text-secondary dark:text-text-dark-secondary text-base text-center leading-6">
            {t("history.empty")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const cat = item.contents?.category ?? "movie";
            const color = CATEGORY_COLORS[cat] ?? "#6B6560";
            const bg = CATEGORY_BG[cat] ?? "#6B656018";
            return (
              <Animated.View
                entering={FadeInDown.delay(index * 50).duration(400)}
                className="mb-3"
              >
                <Pressable
                  className="flex-row items-center bg-surface-secondary dark:bg-surface-dark-secondary rounded-3xl p-4 border border-surface-border/30 dark:border-surface-dark-border/30 active:scale-98 transition-transform shadow-sm"
                  onPress={() => setSelectedReview(item)}
                >
                  <View
                    className="w-12 h-12 rounded-2xl items-center justify-center mr-4 shadow-sm"
                    style={{ backgroundColor: bg }}
                  >
                    <Text className="text-lg">
                      {CATEGORY_ICONS[cat as ContentCategory] ?? "📋"}
                    </Text>
                  </View>
                  <View className="flex-1 mr-3">
                    <Text
                      className="text-text dark:text-text-dark text-base font-semibold leading-5 mb-1"
                      numberOfLines={1}
                    >
                      {item.contents?.title ?? item.title ?? ""}
                    </Text>
                    <Text className="text-text-secondary dark:text-text-dark-secondary text-sm">
                      {item.experience_date ?? item.created_at.split("T")[0]}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs font-medium">
                      {formatRelativeDate(item.created_at, lang)}
                    </Text>
                    <View className="w-2 h-2 rounded-full mt-2" style={{ backgroundColor: color }} />
                  </View>
                </Pressable>
              </Animated.View>
            );
          }}
        />
      )}

      {/* ── Enhanced Review Detail Bottom Sheet ── */}
      <Modal
        visible={!!selectedReview}
        transparent
        animationType="slide"
        onRequestClose={() => { setSelectedReview(null); setIsEditing(false); }}
      >
        <Pressable
          className="flex-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => { setSelectedReview(null); setIsEditing(false); }}
        >
          <View className="flex-1" />
          <Pressable
            className={`${isDark ? 'dark' : ''} rounded-t-[32px] shadow-2xl`}
            style={{
              maxHeight: "88%",
              backgroundColor: isDark ? '#221F1A' : '#FDFCF9'
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {selectedReview && (
              <Animated.View entering={SlideInDown.duration(400)} className="flex-1">
                {/* Enhanced Category color strip with gradient */}
                <View
                  className="h-1.5 rounded-t-[32px]"
                  style={{
                    background: `linear-gradient(90deg, ${accentColor}00 0%, ${accentColor} 50%, ${accentColor}00 100%)`,
                    backgroundColor: accentColor
                  }}
                />

                {/* Refined Drag handle */}
                <View className="pt-4 pb-2 items-center">
                  <View className="w-12 h-1.5 bg-surface-tertiary dark:bg-surface-dark-tertiary rounded-full opacity-50" />
                </View>

                {/* Enhanced Header */}
                <View className="px-7 pt-5 pb-5">
                  {/* Refined Category badge + date */}
                  <View className="flex-row items-center justify-between mb-5">
                    <View
                      className="flex-row items-center rounded-2xl px-4 py-2 shadow-sm"
                      style={{ backgroundColor: accentBg }}
                    >
                      <Text className="text-base mr-2">
                        {CATEGORY_ICONS[selectedCategory as ContentCategory] ?? "📋"}
                      </Text>
                      <Text
                        className="text-xs font-bold uppercase tracking-wider"
                        style={{ color: accentColor }}
                      >
                        {selectedCategory}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-text-tertiary dark:text-text-dark-tertiary text-xs font-medium">
                        {formatReadableDate(
                          selectedReview.experience_date ?? selectedReview.created_at,
                          lang
                        )}
                      </Text>
                    </View>
                  </View>

                  {/* Enhanced Title */}
                  <Text className="text-text dark:text-text-dark text-3xl font-bold leading-9 mb-2">
                    {selectedReview.contents?.title ?? ""}
                  </Text>
                  {selectedReview.contents?.creator && (
                    <Text className="text-text-secondary dark:text-text-dark-secondary text-base font-medium">
                      {selectedReview.contents.creator}
                    </Text>
                  )}
                </View>

                {/* Elegant Divider */}
                <View className="mx-7 mb-5 flex-row items-center">
                  <View className="flex-1 h-px bg-gradient-to-r from-transparent via-surface-border dark:via-surface-dark-border to-transparent" />
                  <View className="w-2 h-2 rounded-full mx-4" style={{ backgroundColor: accentColor + '30' }} />
                  <View className="flex-1 h-px bg-gradient-to-r from-transparent via-surface-border dark:via-surface-dark-border to-transparent" />
                </View>

                {/* Enhanced Review body */}
                <ScrollView
                  className="flex-1 px-7"
                  showsVerticalScrollIndicator={false}
                  style={{ maxHeight: 320 }}
                >
                  {isEditing ? (
                    <View className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-3xl p-5 border border-surface-border/50 dark:border-surface-dark-border/50">
                      <TextInput
                        className="text-text dark:text-text-dark text-base leading-7 font-normal"
                        value={editText}
                        onChangeText={setEditText}
                        multiline
                        autoFocus
                        textAlignVertical="top"
                        style={{ minHeight: 200 }}
                        placeholderTextColor={isDark ? '#7A7268' : '#9C9589'}
                      />
                    </View>
                  ) : (
                    <Text className="text-text dark:text-text-dark text-base leading-8 pb-6 font-normal">
                      {selectedReview.body}
                    </Text>
                  )}
                </ScrollView>

                {/* Enhanced Actions */}
                <View className="px-7 pt-5 pb-7">
                  <View className="mb-5 flex-row items-center">
                    <View className="flex-1 h-px bg-gradient-to-r from-surface-border dark:from-surface-dark-border to-transparent" />
                    <View className="flex-1 h-px bg-gradient-to-l from-surface-border dark:from-surface-dark-border to-transparent" />
                  </View>
                  {isEditing ? (
                    <View className="flex-row gap-4">
                      <Pressable
                        className="flex-1 bg-surface-tertiary dark:bg-surface-dark-tertiary rounded-3xl py-4 items-center border border-surface-border/30 dark:border-surface-dark-border/30 active:scale-95 transition-transform"
                        onPress={() => setIsEditing(false)}
                      >
                        <Text className="text-text dark:text-text-dark font-semibold text-base">
                          {t("common.cancel")}
                        </Text>
                      </Pressable>
                      <Pressable
                        className="flex-1 rounded-3xl py-4 items-center active:scale-95 transition-transform shadow-lg"
                        style={{ backgroundColor: accentColor }}
                        onPress={handleSaveEdit}
                      >
                        <Text className="text-white font-bold text-base">
                          {t("common.save")}
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View className="flex-row gap-4">
                      <Pressable
                        className="flex-1 bg-surface-secondary dark:bg-surface-dark-secondary border border-surface-border/50 dark:border-surface-dark-border/50 rounded-3xl py-4 items-center active:scale-95 transition-transform"
                        onPress={handleEdit}
                      >
                        <Text className="text-text dark:text-text-dark font-semibold text-base">
                          {t("common.edit")}
                        </Text>
                      </Pressable>
                      <Pressable
                        className="flex-1 bg-surface-secondary dark:bg-surface-dark-secondary border border-surface-border/50 dark:border-surface-dark-border/50 rounded-3xl py-4 items-center active:scale-95 transition-transform"
                        onPress={handleCopy}
                      >
                        <Text className="text-text dark:text-text-dark font-semibold text-base">
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

      {/* Enhanced Toast */}
      {toastMessage && (
        <Animated.View
          entering={FadeIn.duration(300)}
          className="absolute bottom-32 self-center mx-8"
        >
          <View className="bg-text/90 dark:bg-text-dark/90 px-6 py-3.5 rounded-3xl shadow-2xl backdrop-blur-sm">
            <Text className="text-surface dark:text-surface-dark text-sm font-medium text-center">
              {toastMessage}
            </Text>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

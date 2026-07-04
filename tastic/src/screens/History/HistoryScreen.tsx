import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import {
  fetchReviewsByMonth,
  updateReview,
  deleteReview,
  syncUnsavedReviews,
  type ReviewWithContent,
} from "../../services/review";
import { CATEGORY_ICONS } from "../../components/common/CategoryChip";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { formatRelativeDate } from "../../utils/formatDate";
import type { ContentCategory } from "../../types/database";

const CATEGORY_COLORS: Record<string, string> = {
  movie:       "#5C2E2E",
  music:       "#2E3D4F",
  book:        "#3D4A2E",
  art:         "#5C4A2E",
  series:      "#2E3050",
};

const CATEGORY_BG: Record<string, string> = {
  movie:       "#5C2E2E18",
  music:       "#2E3D4F18",
  book:        "#3D4A2E18",
  art:         "#5C4A2E18",
  series:      "#2E305018",
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // 같은 날 평론이 2개 이상일 때 캘린더 탭으로 리스트를 그 날짜로 필터링
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const loadReviews = useCallback(async () => {
    if (!user) return;
    try {
      // 저장 실패로 로컬에 남은 평론이 있으면 먼저 재업로드 후 조회
      await syncUnsavedReviews(user.id).catch(() => {});
      const data = await fetchReviewsByMonth(user.id, year, month);
      setReviews(data);
    } catch {
      setReviews([]);
    }
  }, [user, year, month]);

  // 탭 재진입 시에도 새 평론이 반영되도록 포커스마다 로드
  useFocusEffect(
    useCallback(() => {
      loadReviews();
    }, [loadReviews])
  );

  const prevMonth = () => {
    setSelectedDay(null);
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    setSelectedDay(null);
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const reviewsByDay: Record<number, string[]> = {};
  reviews.forEach((r) => {
    const day = new Date(r.created_at).getDate();
    if (!reviewsByDay[day]) reviewsByDay[day] = [];
    const cat = r.works?.category;
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

  // 1개면 바로 팝업, 2개 이상이면 리스트를 그 날짜로 필터(재탭 시 해제)
  const handleDayPress = (day: number) => {
    const dayReviews = reviewsForDay(day);
    if (dayReviews.length === 1) {
      setSelectedReview(dayReviews[0]);
    } else if (dayReviews.length > 1) {
      setSelectedDay(selectedDay === day ? null : day);
    }
  };

  const displayedReviews = selectedDay !== null ? reviewsForDay(selectedDay) : reviews;

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

  const handleDelete = async () => {
    if (!selectedReview) return;
    setShowDeleteConfirm(false);
    try {
      await deleteReview(selectedReview.id);
      setSelectedReview(null);
      setIsEditing(false);
      setSelectedDay(null);
      showToast(t("common.deleted"));
      loadReviews();
    } catch {
      showToast(lang === "ko" ? "삭제에 실패했습니다" : "Delete failed");
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  const selectedCategory = selectedReview?.works?.category ?? "movie";
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
            <Text className="text-text-tertiary dark:text-text-dark-tertiary text-[13px] uppercase tracking-widest font-medium">
              {t("history.header")}
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
              <Text className="text-text-tertiary dark:text-text-dark-tertiary text-[13px] font-medium uppercase tracking-wider">{d}</Text>
            </View>
          ))}
        </View>

        {/* Safe Calendar grid - simplified to avoid navigation context issues */}
        <View className="flex-row flex-wrap px-1">
          {calendarCells.map((day, idx) => {
            if (!day) {
              // Empty cell
              return <View key={idx} style={{ width: "14.28%", height: 50 }} />;
            }

            const hasReviews = reviewsByDay[day] && reviewsByDay[day].length > 0;
            const isToday = isCurrentMonth && day === today;

            return (
              <View
                key={idx}
                style={{ width: "14.28%", height: 50 }}
                className="items-center justify-center"
              >
                <Pressable
                  onPress={() => hasReviews && handleDayPress(day)}
                  disabled={!hasReviews}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: isToday
                      ? (isDark ? '#D4CFC8' : '#221F1A')
                      : hasReviews
                      ? (isDark ? '#333028' : '#EAE7E0')
                      : 'transparent',
                    borderWidth: selectedDay === day ? 2 : 0,
                    borderColor: isDark ? '#D4CFC8' : '#221F1A',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: isToday ? 'bold' : hasReviews ? '600' : 'normal',
                      color: isToday
                        ? (isDark ? '#221F1A' : '#F8F6F1')
                        : hasReviews
                        ? (isDark ? '#D4CFC8' : '#221F1A')
                        : (isDark ? '#7A7268' : '#9C9589'),
                    }}
                  >
                    {day}
                  </Text>
                </Pressable>
                {hasReviews && (
                  <View style={{ flexDirection: 'row', marginTop: 2, gap: 2 }}>
                    {reviewsByDay[day].slice(0, 3).map((cat, i) => (
                      <View
                        key={i}
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: CATEGORY_COLORS[cat] || '#6B6560',
                        }}
                      />
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* Elegant Divider */}
      <View className="mx-5 mb-2 flex-row items-center">
        <View className="flex-1 h-px bg-gradient-to-r from-transparent via-surface-border dark:via-surface-dark-border to-transparent" />
        <Text className="text-text-tertiary dark:text-text-dark-tertiary text-[13px] mx-4 uppercase tracking-widest font-medium">
          {displayedReviews.length > 0
            ? t("history.countLabel", { count: displayedReviews.length })
            : t("history.header")}
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
          data={displayedReviews}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const cat = item.works?.category ?? "movie";
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
                      {item.works?.title ?? item.title ?? ""}
                    </Text>
                    <Text className="text-text-secondary dark:text-text-dark-secondary text-[15px]">
                      {item.experience_date ?? item.created_at.split("T")[0]}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-text-tertiary dark:text-text-dark-tertiary text-[13px] font-medium">
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
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
        <View style={{ flex: 1 }}>
          {/* Backdrop — 바텀시트와 분리된 별도 레이어 */}
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
            onPress={() => { setSelectedReview(null); setIsEditing(false); }}
          />
          {/* Bottom sheet — backdrop Pressable 안에 중첩되지 않음 */}
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View
            className={`${isDark ? 'dark' : ''} rounded-t-[32px] shadow-2xl`}
            style={{
              maxHeight: "88%",
              backgroundColor: isDark ? '#221F1A' : '#FDFCF9'
            }}
          >
            {selectedReview && (
              <Animated.View entering={FadeIn.duration(250)}>
                {/* Enhanced Category color strip with gradient */}
                <View
                  className="h-1.5 rounded-t-[32px]"
                  style={{ backgroundColor: accentColor }}
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
                        className="text-[13px] font-bold uppercase tracking-wider"
                        style={{ color: accentColor }}
                      >
                        {selectedCategory}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-text-tertiary dark:text-text-dark-tertiary text-[13px] font-medium">
                        {formatReadableDate(
                          selectedReview.experience_date ?? selectedReview.created_at,
                          lang
                        )}
                      </Text>
                    </View>
                  </View>

                  {/* Enhanced Title */}
                  <Text className="text-text dark:text-text-dark text-3xl font-bold leading-9 mb-2">
                    {selectedReview.works?.title ?? ""}
                  </Text>
                  {selectedReview.works?.creator && (
                    <Text className="text-text-secondary dark:text-text-dark-secondary text-base font-medium">
                      {selectedReview.works.creator}
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
                  className="px-7"
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
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
                    <View className="flex-row gap-3">
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
                          {t("common.copy")}
                        </Text>
                      </Pressable>
                      <Pressable
                        className="flex-1 bg-surface-secondary dark:bg-surface-dark-secondary border border-error/30 rounded-3xl py-4 items-center active:scale-95 transition-transform"
                        onPress={() => setShowDeleteConfirm(true)}
                      >
                        <Text className="text-error font-semibold text-base">
                          {t("common.delete")}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </Animated.View>
            )}
          </View>
          </View>

          {/* 삭제 확인 — 바텀시트 Modal 내부에 중첩해 iOS 에서도 위에 표시되게 한다 */}
          <ConfirmDialog
            visible={showDeleteConfirm}
            title={t("common.delete")}
            message={t("history.deleteConfirm")}
            actions={[
              { label: t("common.delete"), onPress: handleDelete, variant: "destructive" },
              { label: t("common.cancel"), onPress: () => setShowDeleteConfirm(false) },
            ]}
            onClose={() => setShowDeleteConfirm(false)}
          />
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Enhanced Toast */}
      {toastMessage && (
        <Animated.View
          entering={FadeIn.duration(300)}
          className="absolute bottom-32 self-center mx-8"
        >
          <View className="bg-text/90 dark:bg-text-dark/90 px-6 py-3.5 rounded-3xl shadow-2xl backdrop-blur-sm">
            <Text className="text-surface dark:text-surface-dark text-[15px] font-medium text-center">
              {toastMessage}
            </Text>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

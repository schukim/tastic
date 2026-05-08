import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import type { ReviewStackParamList } from "../../types/navigation";
import type { ContentCategory } from "../../types/database";
import { CategoryChip } from "../../components/common/CategoryChip";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import { loadDraft, clearDraft } from "../../utils/storage";
import { toISODateString } from "../../utils/formatDate";

type Nav = NativeStackNavigationProp<ReviewStackParamList, "ReviewHome">;

const ALL_CATEGORIES: ContentCategory[] = [
  "movie", "music", "book", "art",
];

const CREATOR_LABEL: Record<ContentCategory, string> = {
  movie: "감독",
  music: "아티스트",
  book: "작가",
  art: "아티스트",
};

export function ReviewHomeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const { isDark } = useTheme();
  const { height } = useWindowDimensions();

  const [category, setCategory] = useState<ContentCategory | null>(null);
  const [musicType, setMusicType] = useState<"album" | "song">("album");
  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const [experienceDate] = useState(toISODateString(new Date()));
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");

  const titleRef = useRef<TextInput>(null);

  // Animate the top padding of the whole content block
  const paddingTop = useSharedValue(height * 0.32);
  const fieldsOpacity = useSharedValue(0);
  const fieldsTranslateY = useSharedValue(16);

  // Entrance animations
  const ENTER = { duration: 420, easing: Easing.out(Easing.cubic) };
  const greetingOpacity = useSharedValue(0);
  const greetingTranslateY = useSharedValue(18);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(18);
  const chip0Opacity = useSharedValue(0);
  const chip0TranslateY = useSharedValue(14);
  const chip1Opacity = useSharedValue(0);
  const chip1TranslateY = useSharedValue(14);
  const chip2Opacity = useSharedValue(0);
  const chip2TranslateY = useSharedValue(14);
  const chip3Opacity = useSharedValue(0);
  const chip3TranslateY = useSharedValue(14);

  const greetingStyle = useAnimatedStyle(() => ({
    opacity: greetingOpacity.value,
    transform: [{ translateY: greetingTranslateY.value }],
  }));
  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));
  const chipStyles = [
    useAnimatedStyle(() => ({ opacity: chip0Opacity.value, transform: [{ translateY: chip0TranslateY.value }] })),
    useAnimatedStyle(() => ({ opacity: chip1Opacity.value, transform: [{ translateY: chip1TranslateY.value }] })),
    useAnimatedStyle(() => ({ opacity: chip2Opacity.value, transform: [{ translateY: chip2TranslateY.value }] })),
    useAnimatedStyle(() => ({ opacity: chip3Opacity.value, transform: [{ translateY: chip3TranslateY.value }] })),
  ];

  useEffect(() => {
    greetingOpacity.value = withDelay(0, withTiming(1, ENTER));
    greetingTranslateY.value = withDelay(0, withTiming(0, ENTER));
    subtitleOpacity.value = withDelay(120, withTiming(1, ENTER));
    subtitleTranslateY.value = withDelay(120, withTiming(0, ENTER));
    const chipOpacities = [chip0Opacity, chip1Opacity, chip2Opacity, chip3Opacity];
    const chipTranslates = [chip0TranslateY, chip1TranslateY, chip2TranslateY, chip3TranslateY];
    chipOpacities.forEach((sv, i) => { sv.value = withDelay(260 + i * 90, withTiming(1, ENTER)); });
    chipTranslates.forEach((sv, i) => { sv.value = withDelay(260 + i * 90, withTiming(0, ENTER)); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    paddingTop: paddingTop.value,
  }));

  const fieldsStyle = useAnimatedStyle(() => ({
    opacity: fieldsOpacity.value,
    transform: [{ translateY: fieldsTranslateY.value }],
  }));

  const expandForm = useCallback(() => {
    if (isExpanded) return;
    setIsExpanded(true);
    paddingTop.value = withTiming(64, { duration: 350, easing: Easing.out(Easing.cubic) });
    fieldsOpacity.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) });
    fieldsTranslateY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) });
  }, [isExpanded, paddingTop, fieldsOpacity, fieldsTranslateY]);

  const handleSelectCategory = useCallback((cat: ContentCategory) => {
    setCategory(cat);
    setMusicType("album");
    setTitle("");
    setCreator("");
    expandForm();
    setTimeout(() => titleRef.current?.focus(), 400);
  }, [expandForm]);

  useEffect(() => {
    loadDraft().then((draft) => {
      if (draft) {
        setDraftTitle(draft.content.title);
        setShowDraftDialog(true);
      }
    });
  }, []);

  const handleDraftContinue = async () => {
    const draft = await loadDraft();
    if (!draft) return;
    setShowDraftDialog(false);
    navigation.navigate("Interview", { content: draft.content });
  };

  const handleDraftDiscard = async () => {
    await clearDraft();
    setShowDraftDialog(false);
  };

  const isValid = title.trim().length > 0 && category !== null;

  const handleNext = () => {
    if (!isValid || !category) return;
    navigation.navigate("ContentConfirm", {
      title: title.trim(),
      creator: creator.trim(),
      category,
      experienceDate,
      musicType: category === "music" ? musicType : undefined,
    });
  };

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? 'dark' : ''}`}
      style={{ backgroundColor: isDark ? '#1A1814' : '#F8F6F1' }}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Animated.ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
          style={containerStyle}
        >
          {/* Greeting */}
          <Animated.View style={greetingStyle}>
            <Text className="text-text dark:text-text-dark text-2xl font-bold leading-9 mb-6">
              {t("review.greeting", { name: user?.nickname ?? "" })}
            </Text>
          </Animated.View>

          {/* Category chips */}
          {!isExpanded && (
            <Animated.View style={subtitleStyle}>
              <Text className="text-text-secondary dark:text-text-dark-secondary text-sm mb-3">
                카테고리를 선택하세요
              </Text>
            </Animated.View>
          )}
          <View className="flex-row flex-wrap mb-4">
            {ALL_CATEGORIES.map((cat, i) => (
              <Animated.View key={cat} style={chipStyles[i]}>
                <CategoryChip
                  category={cat}
                  selected={category === cat}
                  onPress={() => {
                    if (isExpanded) {
                      setCategory(cat);
                      setMusicType("album");
                      setTitle("");
                      setCreator("");
                      setTimeout(() => titleRef.current?.focus(), 100);
                    } else {
                      handleSelectCategory(cat);
                    }
                  }}
                />
              </Animated.View>
            ))}
          </View>

          {/* Form fields */}
          <Animated.View style={fieldsStyle}>
            <TextInput
              ref={titleRef}
              className="bg-surface-secondary dark:bg-surface-dark-secondary border border-surface-tertiary dark:border-surface-dark-border rounded-xl px-4 py-3.5 text-text dark:text-text-dark text-base mb-3"
              placeholder="제목"
              placeholderTextColor={isDark ? '#7A7268' : '#9C9589'}
              value={title}
              onChangeText={setTitle}
            />

            {category === "music" && (
              <View className="flex-row mb-3 rounded-xl overflow-hidden border border-surface-tertiary dark:border-surface-dark-border">
                <Pressable
                  className={`flex-1 py-3 items-center ${musicType === "album" ? "bg-primary dark:bg-primary-dm" : "bg-surface-secondary dark:bg-surface-dark-secondary"}`}
                  onPress={() => setMusicType("album")}
                >
                  <Text className={`text-sm font-medium ${musicType === "album" ? "text-white" : "text-text-secondary dark:text-text-dark-secondary"}`}>
                    앨범
                  </Text>
                </Pressable>
                <Pressable
                  className={`flex-1 py-3 items-center ${musicType === "song" ? "bg-primary dark:bg-primary-dm" : "bg-surface-secondary dark:bg-surface-dark-secondary"}`}
                  onPress={() => setMusicType("song")}
                >
                  <Text className={`text-sm font-medium ${musicType === "song" ? "text-white" : "text-text-secondary dark:text-text-dark-secondary"}`}>
                    곡
                  </Text>
                </Pressable>
              </View>
            )}

            {category && (
              <TextInput
                className="bg-surface-secondary dark:bg-surface-dark-secondary border border-surface-tertiary dark:border-surface-dark-border rounded-xl px-4 py-3.5 text-text dark:text-text-dark text-base mb-6"
                placeholder={CREATOR_LABEL[category]}
                placeholderTextColor={isDark ? '#7A7268' : '#9C9589'}
                value={creator}
                onChangeText={setCreator}
              />
            )}

            <Pressable
              className={`rounded-xl py-4 items-center ${isValid ? "bg-primary dark:bg-primary-dm" : "bg-primary/40 dark:bg-primary-dm/40"}`}
              onPress={handleNext}
              disabled={!isValid}
            >
              <Text className="text-white font-semibold text-base">{t("review.next")}</Text>
            </Pressable>
          </Animated.View>
        </Animated.ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={showDraftDialog}
        title={t("review.draft.title")}
        message={t("review.draft.message", { title: draftTitle })}
        actions={[
          { label: t("review.draft.continue"), onPress: handleDraftContinue, variant: "primary" },
          { label: t("review.draft.startNew"), onPress: handleDraftDiscard },
        ]}
        onClose={() => setShowDraftDialog(false)}
      />
    </SafeAreaView>
  );
}

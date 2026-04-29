import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import type { ReviewStackParamList } from "../../types/navigation";
import type { ContentCategory } from "../../types/database";
import { CategoryChip } from "../../components/common/CategoryChip";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { useAuthStore } from "../../stores/authStore";
import { loadDraft, clearDraft } from "../../utils/storage";
import { toISODateString } from "../../utils/formatDate";

type Nav = NativeStackNavigationProp<ReviewStackParamList, "ReviewHome">;

const ALL_CATEGORIES: ContentCategory[] = [
  "movie", "music", "book", "art", "exhibition", "performance",
];

export function ReviewHomeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ContentCategory | null>(null);
  const [experienceDate, setExperienceDate] = useState(toISODateString(new Date()));
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");

  // Animation
  const greetingTop = useSharedValue(0.4);
  const fieldsOpacity = useSharedValue(0);

  const greetingStyle = useAnimatedStyle(() => ({
    top: `${greetingTop.value * 100}%`,
  }));

  const fieldsStyle = useAnimatedStyle(() => ({
    opacity: fieldsOpacity.value,
  }));

  const expandForm = useCallback(() => {
    if (isExpanded) return;
    setIsExpanded(true);
    greetingTop.value = withTiming(0.08, { duration: 300, easing: Easing.out(Easing.cubic) });
    fieldsOpacity.value = withTiming(1, { duration: 300 });
  }, [isExpanded, greetingTop, fieldsOpacity]);

  // Check for draft on mount
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
    // Navigate to interview with restored draft
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
      category,
      experienceDate,
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View className="flex-1 px-6">
          {/* Greeting */}
          <Animated.View style={[{ position: "absolute", left: 24, right: 24 }, greetingStyle]}>
            <Text className="text-text text-2xl font-bold leading-9">
              {t("review.greeting", { name: user?.nickname ?? "" })}
            </Text>
          </Animated.View>

          {/* Title Input */}
          <View style={{ marginTop: isExpanded ? 140 : "55%" }}>
            <TextInput
              className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3.5 text-text text-base"
              placeholder={t("review.titlePlaceholder")}
              placeholderTextColor="#9C9589"
              value={title}
              onChangeText={setTitle}
              onFocus={expandForm}
            />
          </View>

          {/* Expandable Fields */}
          <Animated.View style={fieldsStyle} className="mt-6">
            {/* Category */}
            <Text className="text-text-secondary text-sm mb-3">
              {t("category.movie").charAt(0) === "영" ? "카테고리" : "Category"}
            </Text>
            <View className="flex-row flex-wrap mb-6">
              {ALL_CATEGORIES.map((cat) => (
                <CategoryChip
                  key={cat}
                  category={cat}
                  selected={category === cat}
                  onPress={() => setCategory(cat)}
                />
              ))}
            </View>

            {/* Experience Date */}
            <Text className="text-text-secondary text-sm mb-2">{t("review.experienceDate")}</Text>
            <Pressable className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3.5 mb-8">
              <Text className="text-text text-base">{experienceDate}</Text>
            </Pressable>

            {/* Next Button */}
            <Pressable
              className={`rounded-xl py-4 items-center ${isValid ? "bg-primary" : "bg-primary/40"}`}
              onPress={handleNext}
              disabled={!isValid}
            >
              <Text className="text-white font-semibold text-base">{t("review.next")}</Text>
            </Pressable>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>

      {/* Draft Dialog */}
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

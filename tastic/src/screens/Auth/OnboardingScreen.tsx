import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { ContentCategory } from "../../types/database";
import { CategoryChip } from "../../components/common/CategoryChip";
import { supabase } from "../../services/supabase";
import { useAuthStore } from "../../stores/authStore";

const ALL_CATEGORIES: ContentCategory[] = [
  "movie", "music", "book", "art", "series",
];

/**
 * 소셜 로그인(구글 등)으로 처음 가입한 유저는 닉네임이 'User'로,
 * 관심 카테고리가 비어있는 채로 생성된다(handle_new_user 트리거 기본값).
 * 프로필이 비어있을 때 RootNavigator가 이 화면으로 보내 온보딩을 완료시킨다.
 */
export function OnboardingScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [nickname, setNickname] = useState(
    user && user.nickname !== "User" ? user.nickname : ""
  );
  const [selectedCategories, setSelectedCategories] = useState<ContentCategory[]>(
    user?.preferred_categories ?? []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = nickname.trim().length > 0 && selectedCategories.length > 0;

  const toggleCategory = (cat: ContentCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleSave = async () => {
    if (!isValid || !user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: updateError } = await supabase
        .from("users")
        .update({
          nickname: nickname.trim(),
          preferred_categories: selectedCategories,
        })
        .eq("id", user.id)
        .select()
        .single();

      if (updateError) throw updateError;

      // 스토어 갱신 → preferred_categories 가 채워져 RootNavigator 가 Main 으로 전환
      setUser(data as typeof user);
    } catch (e: unknown) {
      console.error("onboarding save error:", e);
      setError(t("onboarding.saveError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          className="flex-1 px-6"
          contentContainerClassName="pt-12 pb-8"
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-text text-2xl font-bold mb-2">{t("onboarding.title")}</Text>
          <Text className="text-text-secondary text-base mb-8">{t("onboarding.subtitle")}</Text>

          {/* Nickname */}
          <View className="mb-6">
            <Text className="text-text-secondary text-[15px] mb-1.5">{t("auth.nickname")}</Text>
            <TextInput
              className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3.5 text-text text-base"
              value={nickname}
              onChangeText={(text) => { setNickname(text); setError(null); }}
              autoCapitalize="none"
              maxLength={20}
            />
          </View>

          {/* Categories */}
          <View className="mb-6">
            <Text className="text-text-secondary text-[15px] mb-3">{t("auth.selectCategories")}</Text>
            <View className="flex-row gap-1.5">
              {ALL_CATEGORIES.map((cat) => (
                <View key={cat} style={{ flex: 1 }}>
                  <CategoryChip
                    category={cat}
                    selected={selectedCategories.includes(cat)}
                    onPress={toggleCategory}
                    fluid
                  />
                </View>
              ))}
            </View>
          </View>

          {/* Error */}
          {error && <Text className="text-error text-[15px] mb-4">{error}</Text>}

          {/* Save */}
          <Pressable
            className={`rounded-xl py-4 items-center ${isValid && !loading ? "bg-primary" : "bg-primary/40"}`}
            onPress={handleSave}
            disabled={!isValid || loading}
          >
            <Text className="text-white font-semibold text-base">
              {loading ? "..." : t("onboarding.save")}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

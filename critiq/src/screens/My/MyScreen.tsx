import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Switch,
  Image,
  TextInput,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { useAuthStore } from "../../stores/authStore";
import { supabase } from "../../services/supabase";
import { getReviewCount } from "../../services/taste";
import { CategoryChip } from "../../components/common/CategoryChip";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import type { ContentCategory, Language } from "../../types/database";
import i18n from "../../i18n";

const ALL_CATEGORIES: ContentCategory[] = [
  "movie", "music", "book", "art", "exhibition", "performance",
];

export function MyScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [reviewCount, setReviewCount] = useState(0);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(user?.nickname ?? "");
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLanguageSheet, setShowLanguageSheet] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        getReviewCount(user.id).then(setReviewCount);
      }
    }, [user])
  );

  const updateProfile = async (updates: Record<string, unknown>) => {
    if (!user) return;
    const { error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", user.id);

    if (!error) {
      setUser({ ...user, ...updates } as typeof user);
    }
  };

  const handleNicknameSave = () => {
    if (nicknameInput.trim()) {
      updateProfile({ nickname: nicknameInput.trim() });
    }
    setIsEditingNickname(false);
  };

  const handleCategoryToggle = (cat: ContentCategory) => {
    if (!user) return;
    const current = user.preferred_categories ?? [];
    const updated = current.includes(cat)
      ? current.filter((c) => c !== cat)
      : [...current, cat];
    updateProfile({ preferred_categories: updated });
  };

  const handleLanguageChange = (lang: Language) => {
    updateProfile({ language: lang });
    i18n.changeLanguage(lang);
    setShowLanguageSheet(false);
  };

  const handleLogout = async () => {
    setShowLogoutDialog(false);
    await supabase.auth.signOut();
  };

  const handleDeleteAccount = async () => {
    setShowDeleteDialog(false);
    // Delete user data then sign out
    if (user) {
      await supabase.from("users").delete().eq("id", user.id);
    }
    await supabase.auth.signOut();
  };

  if (!user) return null;

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView className="flex-1" contentContainerClassName="px-6 pt-6 pb-12">
        {/* ── Profile Section ── */}
        <View className="items-center mb-8">
          <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-3">
            {user.avatar_url ? (
              <Image
                source={{ uri: user.avatar_url }}
                className="w-20 h-20 rounded-full"
              />
            ) : (
              <Text className="text-3xl">👤</Text>
            )}
          </View>

          {isEditingNickname ? (
            <View className="flex-row items-center">
              <TextInput
                className="text-text text-xl font-bold text-center border-b border-primary px-2 py-1"
                value={nicknameInput}
                onChangeText={setNicknameInput}
                autoFocus
                onBlur={handleNicknameSave}
                onSubmitEditing={handleNicknameSave}
              />
            </View>
          ) : (
            <Pressable onPress={() => { setNicknameInput(user.nickname); setIsEditingNickname(true); }}>
              <Text className="text-text text-xl font-bold">{user.nickname}</Text>
            </Pressable>
          )}

          <Text className="text-text-tertiary text-sm mt-1">
            {t("tabs.review")} {reviewCount}
          </Text>
        </View>

        {/* ── Interest Categories ── */}
        <View className="mb-8">
          <Text className="text-text text-base font-semibold mb-3">
            {t("my.categories")}
          </Text>
          <View className="flex-row flex-wrap">
            {ALL_CATEGORIES.map((cat) => (
              <CategoryChip
                key={cat}
                category={cat}
                selected={(user.preferred_categories ?? []).includes(cat)}
                onPress={handleCategoryToggle}
              />
            ))}
          </View>
        </View>

        {/* ── Settings ── */}
        <View className="mb-8">
          <Text className="text-text text-base font-semibold mb-3">
            {t("my.settings")}
          </Text>

          {/* Dark mode */}
          <View className="flex-row items-center justify-between py-3 border-b border-surface-tertiary">
            <Text className="text-text text-base">{t("my.darkMode")}</Text>
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ true: "#6366F1" }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Language */}
          <Pressable
            className="flex-row items-center justify-between py-3 border-b border-surface-tertiary"
            onPress={() => setShowLanguageSheet(true)}
          >
            <Text className="text-text text-base">{t("my.language")}</Text>
            <Text className="text-text-secondary text-base">
              {user.language === "ko" ? "한국어" : "English"}
            </Text>
          </Pressable>
        </View>

        {/* ── Subscription ── */}
        <View className="mb-8">
          <Text className="text-text text-base font-semibold mb-3">
            {t("my.subscription")}
          </Text>
          <View className="bg-surface-secondary rounded-xl p-4">
            <Text className="text-text text-base">{t("my.freePlan")}</Text>
          </View>
        </View>

        {/* ── Account ── */}
        <View>
          <Pressable
            className="py-4 border-b border-surface-tertiary"
            onPress={() => setShowLogoutDialog(true)}
          >
            <Text className="text-error text-base">{t("my.logout")}</Text>
          </Pressable>
          <Pressable
            className="py-4"
            onPress={() => setShowDeleteDialog(true)}
          >
            <Text className="text-text-tertiary text-base">{t("my.deleteAccount")}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Language Bottom Sheet */}
      <Modal
        visible={showLanguageSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLanguageSheet(false)}
      >
        <Pressable className="flex-1 bg-dim" onPress={() => setShowLanguageSheet(false)}>
          <View className="flex-1" />
          <Pressable className="bg-surface rounded-t-3xl p-6" onPress={(e) => e.stopPropagation()}>
            <View className="w-10 h-1 bg-surface-tertiary rounded-full self-center mb-6" />
            <Pressable
              className={`py-4 border-b border-surface-tertiary flex-row justify-between ${user.language === "ko" ? "" : ""}`}
              onPress={() => handleLanguageChange("ko")}
            >
              <Text className="text-text text-base">한국어</Text>
              {user.language === "ko" && <Text className="text-primary">✓</Text>}
            </Pressable>
            <Pressable
              className="py-4 flex-row justify-between"
              onPress={() => handleLanguageChange("en")}
            >
              <Text className="text-text text-base">English</Text>
              {user.language === "en" && <Text className="text-primary">✓</Text>}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Logout Dialog */}
      <ConfirmDialog
        visible={showLogoutDialog}
        title={t("my.logout")}
        message={t("my.logoutConfirm")}
        actions={[
          { label: t("my.logout"), onPress: handleLogout, variant: "destructive" },
          { label: t("common.cancel"), onPress: () => setShowLogoutDialog(false) },
        ]}
        onClose={() => setShowLogoutDialog(false)}
      />

      {/* Delete Account Dialog */}
      <ConfirmDialog
        visible={showDeleteDialog}
        title={t("my.deleteAccount")}
        message={t("my.deleteConfirm")}
        actions={[
          { label: t("common.delete"), onPress: handleDeleteAccount, variant: "destructive" },
          { label: t("common.cancel"), onPress: () => setShowDeleteDialog(false) },
        ]}
        onClose={() => setShowDeleteDialog(false)}
      />
    </SafeAreaView>
  );
}

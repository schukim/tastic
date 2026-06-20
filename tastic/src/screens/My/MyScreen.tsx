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
import * as WebBrowser from "expo-web-browser";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import { supabase } from "../../services/supabase";
import { presentMembershipPaywall } from "../../services/purchases";
import { getReviewCount } from "../../services/taste";
import { CategoryChip } from "../../components/common/CategoryChip";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import type { ContentCategory, Language } from "../../types/database";
import i18n from "../../i18n";

const PRIVACY_POLICY_URL = "https://schukim.github.io/tastic/legal/privacy-policy.html";

const ALL_CATEGORIES: ContentCategory[] = [
  "movie", "music", "book", "art", "series",
];

export function MyScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const reset = useAuthStore((s) => s.reset);
  const { isDark, setDark } = useTheme();

  const [reviewCount, setReviewCount] = useState(0);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(user?.nickname ?? "");
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLanguageSheet, setShowLanguageSheet] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);

  // DB에서 최신 프로필(plan)을 다시 읽어 스토어에 반영.
  const refetchProfile = useCallback(async () => {
    const current = useAuthStore.getState().user;
    if (!current) return;
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", current.id)
      .single();
    if (!error && data) setUser({ ...current, ...data });
  }, [setUser]);

  // 멤버십 업그레이드: RevenueCat 페이월 → 구매 성공 시 웹훅이 users.plan을 갱신한다.
  // 웹훅 반영에 약간의 지연이 있으므로 몇 차례 재조회한다.
  const handleUpgrade = async () => {
    if (isUpgrading) return;
    setIsUpgrading(true);
    try {
      const purchased = await presentMembershipPaywall();
      if (purchased) {
        for (let i = 0; i < 5; i++) {
          await refetchProfile();
          if (useAuthStore.getState().user?.plan !== "free") break;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    } finally {
      setIsUpgrading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        getReviewCount(user.id).then(setReviewCount);
        // 구독(plan) 등 프로필이 DB에서 변경됐을 수 있으니 진입 시 새로 읽어 반영
        supabase
          .from("users")
          .select("*")
          .eq("id", user.id)
          .single()
          .then(({ data, error }) => {
            const current = useAuthStore.getState().user;
            if (!error && data && current && data.plan !== current.plan) {
              setUser({ ...current, ...data });
            }
          });
      }
      // user 전체를 deps에 넣으면 setUser로 인한 무한 refetch가 생길 수 있어 id만 추적
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id])
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
    try {
      await supabase.auth.signOut();
    } catch {
      // signOut failed (e.g. network), fall through to reset store
    }
    reset();
  };

  const handleDeleteAccount = async () => {
    setShowDeleteDialog(false);
    if (user) {
      await supabase.from("users").delete().eq("id", user.id);
    }
    await supabase.auth.signOut();
  };

  if (!user) return null;

  return (
    <SafeAreaView className={`flex-1 ${isDark ? 'dark' : ''}`} style={{ backgroundColor: isDark ? '#1A1814' : '#F8F6F1' }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 32, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

        {/* ── Profile Section ── */}
        <View className="items-center mb-10">
          <View className="w-20 h-20 rounded-full bg-surface-tertiary dark:bg-surface-dark-secondary items-center justify-center mb-4 border border-surface-border dark:border-surface-dark-border">
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
                className="text-text dark:text-text-dark text-xl font-bold text-center border-b border-text-secondary dark:border-text-dark-secondary px-2 py-1"
                value={nicknameInput}
                onChangeText={setNicknameInput}
                autoFocus
                onBlur={handleNicknameSave}
                onSubmitEditing={handleNicknameSave}
              />
            </View>
          ) : (
            <Pressable onPress={() => { setNicknameInput(user.nickname); setIsEditingNickname(true); }}>
              <Text className="text-text dark:text-text-dark text-xl font-bold">{user.nickname}</Text>
            </Pressable>
          )}

          <Text className="text-text-tertiary dark:text-text-dark-tertiary text-[15px] mt-1.5">
            평론 {reviewCount}개
          </Text>
        </View>

        {/* ── Interest Categories ── */}
        <View className="mb-8">
          <Text className="text-text dark:text-text-dark text-[15px] font-semibold mb-3 uppercase tracking-widest opacity-50">
            {t("my.categories")}
          </Text>
          <View className="flex-row gap-1.5">
            {ALL_CATEGORIES.map((cat) => (
              <View key={cat} style={{ flex: 1 }}>
                <CategoryChip
                  category={cat}
                  selected={(user.preferred_categories ?? []).includes(cat)}
                  onPress={handleCategoryToggle}
                  fluid
                />
              </View>
            ))}
          </View>
        </View>

        {/* ── Settings ── */}
        <View className="mb-8">
          <Text className="text-text dark:text-text-dark text-[15px] font-semibold mb-3 uppercase tracking-widest opacity-50">
            {t("my.settings")}
          </Text>

          <View className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-2xl overflow-hidden border border-surface-border dark:border-surface-dark-border">
            {/* Enhanced Dark mode */}
            <View className="flex-row items-center justify-between px-4 py-2 border-b border-surface-tertiary/50 dark:border-surface-dark-tertiary/50">
              <View className="flex-row items-center">
                <Text className="text-base mr-3">{isDark ? "🌙" : "☀️"}</Text>
                <Text className="text-text dark:text-text-dark text-base font-medium">{t("my.darkMode")}</Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={setDark}
                trackColor={{
                  false: isDark ? "#333028" : "#EAE7E0",
                  true: isDark ? "#D4CFC8" : "#221F1A"
                }}
                thumbColor={isDark ? "#1A1814" : "#F8F6F1"}
              />
            </View>

            {/* Language */}
            <Pressable
              className="flex-row items-center justify-between px-4 py-3.5 border-b border-surface-tertiary/50 dark:border-surface-dark-tertiary/50"
              onPress={() => setShowLanguageSheet(true)}
            >
              <Text className="text-text dark:text-text-dark text-base">{t("my.language")}</Text>
              <Text className="text-text-secondary dark:text-text-dark-secondary text-base">
                {user.language === "ko" ? "한국어" : "English"}
              </Text>
            </Pressable>

            {/* Privacy Policy */}
            <Pressable
              className="flex-row items-center justify-between px-4 py-3.5"
              onPress={() => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}
            >
              <Text className="text-text dark:text-text-dark text-base">{t("my.privacyPolicy")}</Text>
              <Text className="text-text-tertiary dark:text-text-dark-tertiary text-base">›</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Subscription ── */}
        <View className="mb-8">
          <Text className="text-text dark:text-text-dark text-[15px] font-semibold mb-3 uppercase tracking-widest opacity-50">
            {t("my.subscription")}
          </Text>
          {user.plan === "free" ? (
            <View className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-2xl border border-surface-border dark:border-surface-dark-border p-5">
              <View className="flex-row items-baseline justify-between mb-4">
                <Text className="text-text dark:text-text-dark text-[17px] font-bold">
                  {t("my.membershipTitle")}
                </Text>
                <Text className="text-text dark:text-text-dark text-[15px] font-semibold">
                  {t("my.membershipPrice")}
                </Text>
              </View>
              <View className="gap-2.5 mb-5">
                {[t("my.membershipBenefit1"), t("my.membershipBenefit2"), t("my.membershipBenefit3")].map((b) => (
                  <View key={b} className="flex-row items-center">
                    <Text className="text-primary dark:text-primary-dm text-[13px] font-bold mr-2.5">✓</Text>
                    <Text className="text-text-secondary dark:text-text-dark-secondary text-[15px]">{b}</Text>
                  </View>
                ))}
              </View>
              <Pressable
                className="bg-primary dark:bg-primary-dm rounded-xl py-3.5 items-center active:opacity-80"
                onPress={handleUpgrade}
                disabled={isUpgrading}
              >
                <Text className="text-surface dark:text-surface-dark text-base font-semibold">
                  {isUpgrading ? t("my.upgrading") : t("my.upgradeMembership")}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-2xl border border-surface-border dark:border-surface-dark-border px-4 py-4 flex-row items-center">
              <View className="w-9 h-9 rounded-full bg-primary dark:bg-primary-dm items-center justify-center mr-3">
                <Text className="text-surface dark:text-surface-dark text-base font-bold">✓</Text>
              </View>
              <View className="flex-1">
                <Text className="text-text dark:text-text-dark text-base font-semibold">
                  {t("my.membershipActive")}
                </Text>
                <Text className="text-text-tertiary dark:text-text-dark-tertiary text-[13px] mt-0.5">
                  {t("my.membershipActiveDesc")}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Account ── */}
        <View className="bg-surface-secondary dark:bg-surface-dark-secondary rounded-2xl overflow-hidden border border-surface-border dark:border-surface-dark-border">
          <Pressable
            className="px-4 py-3.5 border-b border-surface-tertiary dark:border-surface-dark-tertiary"
            onPress={() => setShowLogoutDialog(true)}
          >
            <Text className="text-error text-base">{t("my.logout")}</Text>
          </Pressable>
          <Pressable
            className="px-4 py-3.5"
            onPress={() => setShowDeleteDialog(true)}
          >
            <Text className="text-text-tertiary dark:text-text-dark-tertiary text-base">{t("my.deleteAccount")}</Text>
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
          <Pressable className="bg-surface dark:bg-surface-dark rounded-t-3xl p-6" onPress={(e) => e.stopPropagation()}>
            <View className="w-10 h-1 bg-surface-tertiary dark:bg-surface-dark-tertiary rounded-full self-center mb-6" />
            <Pressable
              className="py-4 border-b border-surface-tertiary dark:border-surface-dark-tertiary flex-row justify-between"
              onPress={() => handleLanguageChange("ko")}
            >
              <Text className="text-text dark:text-text-dark text-base">한국어</Text>
              {user.language === "ko" && <Text className="text-text dark:text-text-dark">✓</Text>}
            </Pressable>
            <Pressable
              className="py-4 flex-row justify-between"
              onPress={() => handleLanguageChange("en")}
            >
              <Text className="text-text dark:text-text-dark text-base">English</Text>
              {user.language === "en" && <Text className="text-text dark:text-text-dark">✓</Text>}
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

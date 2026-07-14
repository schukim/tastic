import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";
import type { PurchasesPackage } from "react-native-purchases";
import { useTheme } from "../../hooks/useTheme";
import {
  getMembershipPackage,
  purchaseMembership,
  restoreMembership,
} from "../../services/purchases";

// 약관/개인정보 링크 (App Store Guideline 3.1.2 — 둘 다 실제 URL 연결 필수).
// 개인정보처리방침은 자체 호스팅, 이용약관(EULA)은 애플 표준 EULA를 사용한다.
const PRIVACY_POLICY_URL = "https://schukim.github.io/tastic/legal/privacy-policy.html";
const TERMS_EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

interface MembershipPaywallProps {
  visible: boolean;
  onClose: () => void;
  // 구매/복원 성공 시 호출 — 상위에서 프로필(plan) 재조회 후 닫는다.
  onPurchased: () => void;
}

interface BenefitRow {
  emoji: string;
  name: string;
  freeTag: string;
}

/**
 * Tastic 멤버십 커스텀 페이월 (design_handoff_paywall 스펙 기반).
 * RevenueCatUI 기본 페이월 대신 앱 디자인 시스템으로 직접 구현한 전체 화면 모달.
 * 결제/복원은 RevenueCat SDK(purchasePackage/restorePurchases)로 연결한다.
 */
export function MembershipPaywall({ visible, onClose, onPurchased }: MembershipPaywallProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();

  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // 모달이 열릴 때마다 최신 오퍼링(가격)을 불러온다.
  useEffect(() => {
    let active = true;
    if (visible) {
      getMembershipPackage().then((p) => {
        if (active) setPkg(p);
      });
    }
    return () => {
      active = false;
    };
  }, [visible]);

  // 실제 스토어 가격 문자열(로케일/통화 반영). 없으면 스펙 기본값으로 폴백.
  const priceString = pkg?.product?.priceString ?? t("paywall.priceFallback");

  const handlePurchase = useCallback(async () => {
    if (purchasing) return;
    if (!pkg) {
      Alert.alert(t("paywall.errorTitle"), t("paywall.unavailable"));
      return;
    }
    setPurchasing(true);
    try {
      const outcome = await purchaseMembership(pkg);
      if (outcome === "purchased") {
        onPurchased();
      } else if (outcome === "unavailable") {
        Alert.alert(t("paywall.errorTitle"), t("paywall.purchaseFailed"));
      }
      // cancelled: 유저가 직접 취소 — 조용히 종료
    } finally {
      setPurchasing(false);
    }
  }, [purchasing, pkg, onPurchased, t]);

  const handleRestore = useCallback(async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const ok = await restoreMembership();
      if (ok) {
        onPurchased();
      } else {
        Alert.alert(t("paywall.errorTitle"), t("paywall.restoreNone"));
      }
    } finally {
      setRestoring(false);
    }
  }, [restoring, onPurchased, t]);

  const benefits: BenefitRow[] = [
    { emoji: "✍️", name: t("paywall.benefitReviewName"), freeTag: t("paywall.tagFreeDaily") },
    { emoji: "💡", name: t("paywall.benefitRecommendName"), freeTag: t("paywall.tagFreeDaily") },
    { emoji: "📊", name: t("paywall.benefitAnalysisName"), freeTag: t("paywall.tagFreeDaily") },
    { emoji: "💬", name: t("paywall.benefitQuestionName"), freeTag: t("paywall.tagFreeSession") },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView
        className={`flex-1 ${isDark ? "dark" : ""}`}
        style={{ backgroundColor: isDark ? "#1A1814" : "#F8F6F1" }}
      >
        {/* ── Top bar ── */}
        <View
          className="flex-row items-center justify-between px-6"
          style={{ minHeight: 44 }}
        >
          <Pressable
            accessibilityLabel={t("paywall.close")}
            accessibilityRole="button"
            onPress={onClose}
            className="w-[34px] h-[34px] rounded-full items-center justify-center active:bg-surface-tertiary dark:active:bg-surface-dark-tertiary"
          >
            <Text className="text-[20px] text-text-secondary dark:text-text-dark-secondary">✕</Text>
          </Pressable>
          <Pressable
            onPress={handleRestore}
            disabled={restoring}
            className="active:opacity-60"
            accessibilityRole="button"
          >
            <Text className="text-[14px] font-semibold text-text-secondary dark:text-text-dark-secondary">
              {t("paywall.restore")}
            </Text>
          </Pressable>
        </View>

        {/* ── Scrollable body ── */}
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Text className="text-[13px] font-semibold uppercase text-text-tertiary dark:text-text-dark-tertiary" style={{ letterSpacing: 0.78 }}>
            {t("paywall.kicker")}
          </Text>
          <Text className="text-[30px] font-bold text-text dark:text-text-dark mt-2" style={{ lineHeight: 36, letterSpacing: -0.3 }}>
            {t("paywall.headline")}
          </Text>
          <Text className="text-[15px] text-text-secondary dark:text-text-dark-secondary mt-3" style={{ lineHeight: 24, maxWidth: 300 }}>
            {t("paywall.lede")}
          </Text>

          {/* Benefits card */}
          <View className="mt-6 rounded-[18px] border border-surface-border dark:border-surface-dark-border bg-surface-secondary dark:bg-surface-dark-secondary px-[18px]">
            {benefits.map((b, i) => (
              <View
                key={b.name}
                className={`flex-row py-4 ${i > 0 ? "border-t border-surface-tertiary dark:border-surface-dark-tertiary" : ""}`}
              >
                <Text className="text-[22px] mt-0.5" style={{ width: 26, textAlign: "center" }}>
                  {b.emoji}
                </Text>
                <View className="flex-1 ml-3.5">
                  <Text className="text-[16px] font-semibold text-text dark:text-text-dark">
                    {b.name}
                  </Text>
                  <View className="flex-row items-center flex-wrap mt-1.5">
                    <View className="rounded-full bg-surface-tertiary dark:bg-surface-dark-tertiary px-2.5 py-0.5">
                      <Text className="text-[12px] font-semibold text-text-secondary dark:text-text-dark-secondary">
                        {b.freeTag}
                      </Text>
                    </View>
                    <Text className="text-[14px] text-text-tertiary dark:text-text-dark-tertiary mx-2">→</Text>
                    <View className="rounded-full bg-primary dark:bg-primary-dm px-2.5 py-0.5">
                      <Text className="text-[12px] font-semibold text-surface dark:text-surface-dark">
                        {t("paywall.tagUnlimited")}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Price */}
          <View className="mt-6">
            <View className="flex-row items-baseline">
              <Text className="text-[34px] font-bold text-text dark:text-text-dark" style={{ letterSpacing: -0.68 }}>
                {priceString}
              </Text>
              <Text className="text-[15px] font-semibold text-text-secondary dark:text-text-dark-secondary ml-2">
                {t("paywall.perMonth")}
              </Text>
            </View>
            <Text className="text-[13px] text-text-tertiary dark:text-text-dark-tertiary mt-2">
              {t("paywall.priceCaption")}
            </Text>
          </View>
        </ScrollView>

        {/* ── Sticky footer ── */}
        <View className="px-6 pt-4 pb-2 border-t border-surface-border dark:border-surface-dark-border">
          <Text
            className="text-[11.5px] text-text-tertiary dark:text-text-dark-tertiary text-center mb-3 self-center"
            style={{ lineHeight: 18, maxWidth: 320 }}
          >
            {t("paywall.renewNotice", { price: priceString })}
          </Text>
          <Pressable
            onPress={handlePurchase}
            disabled={purchasing}
            className="rounded-2xl bg-primary dark:bg-primary-dm items-center justify-center active:opacity-90"
            style={{ height: 56 }}
            accessibilityRole="button"
          >
            {purchasing ? (
              <View className="flex-row items-center">
                <ActivityIndicator size="small" color={isDark ? "#1A1814" : "#F8F6F1"} />
                <Text className="text-[17px] font-bold text-surface dark:text-surface-dark ml-2">
                  {t("paywall.ctaLoading")}
                </Text>
              </View>
            ) : (
              <Text className="text-[17px] font-bold text-surface dark:text-surface-dark">
                {t("paywall.cta")}
              </Text>
            )}
          </Pressable>
          <View className="flex-row items-center justify-center mt-3.5">
            <Pressable onPress={() => WebBrowser.openBrowserAsync(TERMS_EULA_URL)} className="active:opacity-60">
              <Text className="text-[12px] font-medium text-text-secondary dark:text-text-dark-secondary">
                {t("paywall.termsEula")}
              </Text>
            </Pressable>
            <Text className="text-[12px] text-text-tertiary dark:text-text-dark-tertiary mx-1.5 opacity-50">·</Text>
            <Pressable onPress={() => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)} className="active:opacity-60">
              <Text className="text-[12px] font-medium text-text-secondary dark:text-text-dark-secondary">
                {t("paywall.privacy")}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

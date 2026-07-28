import React from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useGuestStore } from "../../stores/guestStore";
import { useTheme } from "../../hooks/useTheme";

interface GuestGateProps {
  // 이 탭이 왜 계정을 필요로 하는지 설명하는 i18n 키
  titleKey: string;
  bodyKey: string;
  icon?: string;
}

/**
 * 계정 기반 탭(히스토리·추천·분석·마이)을 게스트가 열었을 때 대신 보여주는 빈 상태.
 *
 * 막는 화면이 아니라 "계정이 있으면 무엇이 생기는지" 알려주는 화면이다 —
 * 심사 관점에서도 '가입 = 계정 기반 기능'이라는 경계를 화면 안에서 보여주는 자리다.
 */
export function GuestGate({ titleKey, bodyKey, icon = "🔒" }: GuestGateProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const exitGuestToAuth = useGuestStore((s) => s.exitGuestToAuth);

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? "dark" : ""}`}
      style={{ backgroundColor: isDark ? "#1A1814" : "#F8F6F1" }}
    >
      <View className="flex-1 justify-center items-center px-8">
        <Text className="text-4xl mb-5">{icon}</Text>
        <Text className="text-text dark:text-text-dark text-xl font-bold text-center mb-3">
          {t(titleKey)}
        </Text>
        <Text className="text-text-secondary dark:text-text-dark-secondary text-[15px] leading-6 text-center mb-8">
          {t(bodyKey)}
        </Text>
        {/* 계정 기반 탭 안내는 로그인 화면으로 — 여기 오는 사람은 이미 계정이 있는
            복귀 사용자일 수도 있다. 신규 가입은 그 화면의 '회원가입' 링크로 이어진다. */}
        <Pressable
          className="bg-primary dark:bg-primary-dm rounded-xl py-4 px-8 w-full items-center"
          onPress={() => exitGuestToAuth("login")}
        >
          <Text className="text-white font-semibold text-base">{t("guest.signIn")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

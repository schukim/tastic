import React, { useState } from "react";
import { Text, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { supabase } from "../../services/supabase";
import { loadProfile } from "../../services/profile";
import { useAuthStore } from "../../stores/authStore";

/**
 * 세션은 있으나 프로필(users row) 조회가 실패한 상태에서 보여주는 화면.
 * user=null 인 채 Main 으로 들어가 빈 화면이 되는 것을 막고, 재시도/로그아웃 선택지를 준다.
 * 재시도가 성공하면 profileStatus 가 갱신되어 RootNavigator 가 Onboarding/Main 으로 전환한다.
 */
export function ProfileErrorScreen() {
  const { t } = useTranslation();
  const session = useAuthStore((s) => s.session);
  const reset = useAuthStore((s) => s.reset);
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (!session?.user || retrying) return;
    setRetrying(true);
    try {
      await loadProfile(session.user.id);
    } finally {
      setRetrying(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    reset();
  };

  return (
    <SafeAreaView className="flex-1 bg-surface justify-center px-6">
      <Text className="text-text text-xl font-bold text-center mb-2">
        {t("profileError.title")}
      </Text>
      <Text className="text-text-secondary text-base text-center mb-8">
        {t("profileError.subtitle")}
      </Text>

      <Pressable
        className={`rounded-xl py-4 items-center ${retrying ? "bg-primary/40" : "bg-primary"}`}
        onPress={handleRetry}
        disabled={retrying}
      >
        {retrying ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="text-white font-semibold text-base">{t("profileError.retry")}</Text>
        )}
      </Pressable>

      <Pressable className="py-4 items-center mt-1" onPress={handleLogout} disabled={retrying}>
        <Text className="text-text-secondary text-[15px]">{t("profileError.logout")}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

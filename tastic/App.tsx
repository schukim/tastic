import "./global.css";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { NetworkBanner } from "./src/components/common/NetworkBanner";
import { useAuth } from "./src/hooks/useAuth";
import { useDeepLinkAuth } from "./src/hooks/useDeepLinkAuth";
import { useNetwork } from "./src/hooks/useNetwork";
import { useIntroGate } from "./src/hooks/useIntroGate";
import { useGuestInit } from "./src/hooks/useGuestInit";
import { useTheme } from "./src/hooks/useTheme";
import { initPurchases } from "./src/services/purchases";
import * as Sentry from "@sentry/react-native";
import "./src/i18n";

// Sentry 크래시 리포팅 초기화 — 가장 먼저. DSN 미설정 시 자동 비활성(no-op).
// sendDefaultPii=false 로 IP 등 PII 자동 수집을 끈다(개인정보처리방침 일관성).
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  // 트랜잭션 샘플링: 개발 전수, 프로덕션 20%
  tracesSampleRate: __DEV__ ? 1.0 : 0.2,
});

// RevenueCat SDK 초기화 — 앱 로드 시 1회. 인증과 무관하게 가장 먼저 설정한다.
initPurchases();

// Disable React DevTools in development to prevent navigation context issues
if (__DEV__) {
  // @ts-ignore
  if (typeof global !== 'undefined' && global.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    // @ts-ignore
    global.__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot = null;
    // @ts-ignore
    global.__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberUnmount = null;
  }
}

function AppContent() {
  const { isDark } = useTheme();

  // Initialize auth state using real Supabase auth
  useAuth();
  // 딥링크(이메일 확인 등)로 들어온 인증 코드를 세션으로 교환
  useDeepLinkAuth();
  // NetInfo 구독 → networkStore 갱신 (오프라인 배너 표시용)
  useNetwork();
  // 기기 로컬 인트로 노출 여부 로드 (로그인 전 1회 가이드)
  useIntroGate();
  // 게스트 기기 ID / 체험 사용 여부 로드 (비로그인 둘러보기)
  useGuestInit();

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} backgroundColor={isDark ? "#1A1814" : "#F8F6F1"} />
      <NetworkBanner />
      <RootNavigator />
    </>
  );
}

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <AppContent />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap 으로 감싸 네이티브 크래시·성능 계측을 활성화한다.
export default Sentry.wrap(App);

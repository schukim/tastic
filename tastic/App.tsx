import "./global.css";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { useAuth } from "./src/hooks/useAuth";
import { useDeepLinkAuth } from "./src/hooks/useDeepLinkAuth";
import { useTheme } from "./src/hooks/useTheme";
import { initPurchases } from "./src/services/purchases";
import "./src/i18n";

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

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} backgroundColor={isDark ? "#1A1814" : "#F8F6F1"} />
      <RootNavigator />
    </>
  );
}

export default function App() {
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

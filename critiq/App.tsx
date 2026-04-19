import "./global.css";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ReviewStack } from "./src/navigation/ReviewStack";
import { useAuthStore } from "./src/stores/authStore";
import "./src/i18n";

const MOCK_USER_ID = "11111111-1111-1111-1111-111111111111";

function AppContent() {
  const setUser = useAuthStore((s) => s.setUser);
  const setSession = useAuthStore((s) => s.setSession);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    setUser({
      id: MOCK_USER_ID,
      nickname: "테스터",
      avatar_url: null,
      preferred_categories: [],
      language: "ko",
      created_at: new Date().toISOString(),
    });
    setSession({ user: { id: MOCK_USER_ID } } as never);
    setLoading(false);
  }, [setUser, setSession, setLoading]);

  return <ReviewStack />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style="auto" />
          <AppContent />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

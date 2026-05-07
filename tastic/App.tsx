import "./global.css";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { useAuth } from "./src/hooks/useAuth";
import { useTheme } from "./src/hooks/useTheme";
import "./src/i18n";

function AppContent() {
  const { isDark } = useTheme();

  // Initialize auth state using real Supabase auth
  useAuth();

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

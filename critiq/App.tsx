import "./global.css";
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

type Screen = "home" | "login" | "tabs";

function HomeScreen({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>🎬 Critiq</Text>
      <Text style={styles.subtitle}>React Navigation 없는 테스트</Text>
      <Text style={styles.description}>
        Step 5D: 상태 기반 네비게이션 테스트
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => onNavigate("login")}
      >
        <Text style={styles.buttonText}>로그인 화면으로</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.button}
        onPress={() => onNavigate("tabs")}
      >
        <Text style={styles.buttonText}>탭 화면으로</Text>
      </TouchableOpacity>
    </View>
  );
}

function LoginScreen({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>로그인</Text>
      <Text style={styles.description}>로그인 화면입니다</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => onNavigate("home")}
      >
        <Text style={styles.buttonText}>홈으로</Text>
      </TouchableOpacity>
    </View>
  );
}

function TabsScreen({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>탭 화면</Text>
      <Text style={styles.description}>히스토리 • 추천 • 평론 • 분석 • 마이</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => onNavigate("home")}
      >
        <Text style={styles.buttonText}>홈으로</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("home");

  const renderScreen = () => {
    switch (currentScreen) {
      case "login":
        return <LoginScreen onNavigate={setCurrentScreen} />;
      case "tabs":
        return <TabsScreen onNavigate={setCurrentScreen} />;
      default:
        return <HomeScreen onNavigate={setCurrentScreen} />;
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        {renderScreen()}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  text: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: "#666",
    marginBottom: 20,
  },
  description: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginBottom: 30,
  },
  button: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginVertical: 8,
    minWidth: 150,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});

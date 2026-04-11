import "./global.css";
import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

type AuthScreen = "login" | "signup";
type TabScreen = "history" | "recommend" | "review" | "analysis" | "my";
type Screen = AuthScreen | TabScreen;

// Temporary simple screens for testing
function SimpleLoginScreen({
  onNavigateToSignUp,
  onLogin
}: {
  onNavigateToSignUp: () => void;
  onLogin: () => void;
}) {
  return (
    <View style={styles.screenContainer}>
      <Text style={styles.title}>🎬 Critiq</Text>
      <Text style={styles.subtitle}>문화 콘텐츠 평론 앱</Text>
      <Text style={styles.sectionTitle}>로그인</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={onLogin}>
        <Text style={styles.primaryButtonText}>로그인 (임시)</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onNavigateToSignUp}>
        <Text style={styles.linkText}>회원가입</Text>
      </TouchableOpacity>
    </View>
  );
}

function SimpleSignUpScreen({ onNavigateToLogin }: { onNavigateToLogin: () => void }) {
  return (
    <View style={styles.screenContainer}>
      <Text style={styles.title}>🎬 Critiq</Text>
      <Text style={styles.sectionTitle}>회원가입</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={() => {}}>
        <Text style={styles.primaryButtonText}>회원가입 (임시)</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onNavigateToLogin}>
        <Text style={styles.linkText}>로그인으로 돌아가기</Text>
      </TouchableOpacity>
    </View>
  );
}

function SimpleHistoryScreen() {
  return (
    <View style={styles.tabScreenContainer}>
      <Text style={styles.emoji}>📋</Text>
      <Text style={styles.tabTitle}>히스토리</Text>
      <Text style={styles.tabDescription}>평론 기록을 탐색하세요</Text>
    </View>
  );
}

function SimpleRecommendScreen() {
  return (
    <View style={styles.tabScreenContainer}>
      <Text style={styles.emoji}>💡</Text>
      <Text style={styles.tabTitle}>추천</Text>
      <Text style={styles.tabDescription}>취향 기반 콘텐츠 추천</Text>
    </View>
  );
}

function SimpleReviewHomeScreen() {
  return (
    <View style={styles.tabScreenContainer}>
      <Text style={styles.emoji}>✍️</Text>
      <Text style={styles.tabTitle}>평론 작성</Text>
      <Text style={styles.tabDescription}>LLM 인터뷰로 평론을 작성하세요</Text>
    </View>
  );
}

function SimpleAnalysisScreen() {
  return (
    <View style={styles.tabScreenContainer}>
      <Text style={styles.emoji}>📊</Text>
      <Text style={styles.tabTitle}>분석</Text>
      <Text style={styles.tabDescription}>취향 분석 결과</Text>
    </View>
  );
}

function SimpleMyScreen() {
  return (
    <View style={styles.tabScreenContainer}>
      <Text style={styles.emoji}>👤</Text>
      <Text style={styles.tabTitle}>마이페이지</Text>
      <Text style={styles.tabDescription}>프로필 및 설정</Text>
    </View>
  );
}

// Bottom Tab Navigation Component
function BottomTabs({
  currentTab,
  onTabPress
}: {
  currentTab: TabScreen;
  onTabPress: (tab: TabScreen) => void;
}) {
  const tabs: { key: TabScreen; label: string; icon: string }[] = [
    { key: "history", label: "히스토리", icon: "📋" },
    { key: "recommend", label: "추천", icon: "💡" },
    { key: "review", label: "평론", icon: "✍️" },
    { key: "analysis", label: "분석", icon: "📊" },
    { key: "my", label: "마이", icon: "👤" },
  ];

  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={styles.tab}
          onPress={() => onTabPress(tab.key)}
        >
          <Text style={styles.tabIcon}>{tab.icon}</Text>
          <Text
            style={[
              styles.tabLabel,
              currentTab === tab.key ? styles.tabLabelActive : styles.tabLabelInactive
            ]}
          >
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Main App Component
export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("login");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Temporary auth simulation
  const handleLogin = () => {
    setIsLoggedIn(true);
    setCurrentScreen("review");
  };

  // Navigation functions for passing to screens
  const navigateToAuth = (screen: AuthScreen) => setCurrentScreen(screen);
  const navigateToTab = (tab: TabScreen) => setCurrentScreen(tab);

  // Render current screen
  const renderScreen = () => {
    switch (currentScreen) {
      case "login":
        return (
          <SimpleLoginScreen
            onNavigateToSignUp={() => navigateToAuth("signup")}
            onLogin={handleLogin}
          />
        );
      case "signup":
        return <SimpleSignUpScreen onNavigateToLogin={() => navigateToAuth("login")} />;
      case "history":
        return <SimpleHistoryScreen />;
      case "recommend":
        return <SimpleRecommendScreen />;
      case "review":
        return <SimpleReviewHomeScreen />;
      case "analysis":
        return <SimpleAnalysisScreen />;
      case "my":
        return <SimpleMyScreen />;
      default:
        return <SimpleReviewHomeScreen />;
    }
  };

  const isTabScreen = (screen: Screen): screen is TabScreen => {
    return ["history", "recommend", "review", "analysis", "my"].includes(screen);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <View style={styles.container}>
          {renderScreen()}
          {/* Show bottom tabs only when logged in and on tab screens */}
          {isLoggedIn && isTabScreen(currentScreen) && (
            <BottomTabs
              currentTab={currentScreen}
              onTabPress={navigateToTab}
            />
          )}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  screenContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#ffffff",
  },
  tabScreenContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#1f2937",
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
    color: "#1f2937",
  },
  primaryButton: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  linkText: {
    color: "#6366f1",
    fontSize: 16,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  tabTitle: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 8,
    color: "#1f2937",
  },
  tabDescription: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
    paddingBottom: 16,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 12,
  },
  tabLabelActive: {
    color: "#6366f1",
    fontWeight: "600",
  },
  tabLabelInactive: {
    color: "#9ca3af",
  },
});
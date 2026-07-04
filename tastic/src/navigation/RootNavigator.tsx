import React from "react";
import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "../stores/authStore";
import { resolveAuthRoute } from "../utils/authRoute";
import type { RootStackParamList, AuthStackParamList } from "../types/navigation";
import { LoginScreen } from "../screens/Auth/LoginScreen";
import { SignUpScreen } from "../screens/Auth/SignUpScreen";
import { OnboardingScreen } from "../screens/Auth/OnboardingScreen";
import { ProfileErrorScreen } from "../screens/Auth/ProfileErrorScreen";
import { MainTabs } from "./MainTabs";

const Stack = createNativeStackNavigator<RootStackParamList>();

// Separate auth navigator for Login/SignUp
const AuthNav = createNativeStackNavigator<AuthStackParamList>();

function AuthNavigator() {
  return (
    <AuthNav.Navigator screenOptions={{ headerShown: false }}>
      <AuthNav.Screen name="Login" component={LoginScreen} />
      <AuthNav.Screen name="SignUp" component={SignUpScreen} />
    </AuthNav.Navigator>
  );
}

function LoadingScreen() {
  return (
    <View className="flex-1 bg-surface justify-center items-center">
      <ActivityIndicator size="large" color="#6366F1" />
    </View>
  );
}

export function RootNavigator() {
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const profileStatus = useAuthStore((s) => s.profileStatus);

  // 가입/로그인 구분 없이 프로필이 비어있는 유저(소셜 첫 가입 등)는 온보딩으로 보낸다.
  // 분기 로직은 resolveAuthRoute 로 분리해 단위 테스트로 검증한다.
  const route = resolveAuthRoute({ isLoading, hasSession: !!session, profileStatus, user });

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {route === "Loading" ? (
        <Stack.Screen name="Loading" component={LoadingScreen} />
      ) : route === "Auth" ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : route === "ProfileError" ? (
        <Stack.Screen name="ProfileError" component={ProfileErrorScreen} />
      ) : route === "Onboarding" ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : (
        <Stack.Screen name="Main" component={MainTabs} />
      )}
    </Stack.Navigator>
  );
}

import React from "react";
import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "../stores/authStore";
import type { RootStackParamList } from "../types/navigation";
import { LoginScreen } from "../screens/Auth/LoginScreen";
import { SignUpScreen } from "../screens/Auth/SignUpScreen";
import { OnboardingScreen } from "../screens/Auth/OnboardingScreen";
import { MainTabs } from "./MainTabs";

const Stack = createNativeStackNavigator<RootStackParamList>();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Auth" component={AuthNavigator} />
    </Stack.Navigator>
  );
}

// Separate auth navigator for Login/SignUp
import { createNativeStackNavigator as createAuthStack } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../types/navigation";

const AuthNav = createAuthStack<AuthStackParamList>();

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

  // 소셜 가입 등으로 프로필이 비어있는 유저는 온보딩으로. 이메일 가입 유저는
  // 트리거가 카테고리를 채워주므로 이 분기에 걸리지 않는다.
  const needsOnboarding = !!user && (user.preferred_categories?.length ?? 0) === 0;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isLoading ? (
        <Stack.Screen name="Loading" component={LoadingScreen} />
      ) : !session ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : needsOnboarding ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : (
        <Stack.Screen name="Main" component={MainTabs} />
      )}
    </Stack.Navigator>
  );
}

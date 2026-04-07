import React from "react";
import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "../stores/authStore";
import type { RootStackParamList } from "../types/navigation";
import { LoginScreen } from "../screens/Auth/LoginScreen";
import { SignUpScreen } from "../screens/Auth/SignUpScreen";
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

export function RootNavigator() {
  const session = useAuthStore((s) => s.session);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <View className="flex-1 bg-surface justify-center items-center">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {session ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
    </Stack.Navigator>
  );
}

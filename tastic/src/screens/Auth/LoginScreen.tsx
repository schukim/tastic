import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../../types/navigation";
import { signIn, signInWithGoogle, signInWithApple } from "../../services/auth";

type Nav = NativeStackNavigationProp<AuthStackParamList, "Login">;

export function LoginScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 로그인은 형식만 확인 — 비밀번호 길이는 강제하지 않는다(가입 정책이 바뀌어도
  // 기존 계정이 버튼 비활성으로 잠기지 않게). 최종 검증은 서버가 한다.
  const isValid = email.includes("@") && password.length > 0;

  const handleLogin = async () => {
    if (!isValid) return;
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("auth.loginError");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: "google" | "apple") => {
    setLoading(true);
    setError(null);
    try {
      if (provider === "google") {
        await signInWithGoogle();
      } else {
        await signInWithApple();
      }
    } catch (e: unknown) {
      console.error(`${provider} login error:`, e);
      const providerName = provider === "google" ? "Google" : "Apple";
      const message =
        e instanceof Error && e.message
          ? e.message
          : t("auth.socialLoginFailed", { provider: providerName });
      setError(message);
      Alert.alert(
        t("auth.socialLoginErrorTitle", { provider: providerName }),
        message,
        [{ text: t("common.confirm") }]
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-1 justify-center px-6"
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View className="items-center mb-12">
            <Text className="text-primary text-4xl font-bold">{t("app.name")}</Text>
          </View>

          {/* Email */}
          <View className="mb-4">
            <TextInput
              className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3.5 text-text text-base"
              placeholder={t("auth.email")}
              placeholderTextColor="#9C9589"
              value={email}
              onChangeText={(text) => { setEmail(text); setError(null); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          {/* Password */}
          <View className="mb-2">
            <View className="relative">
              <TextInput
                className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3.5 text-text text-base pr-16"
                placeholder={t("auth.password")}
                placeholderTextColor="#9C9589"
                value={password}
                onChangeText={(text) => { setPassword(text); setError(null); }}
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <Pressable
                className="absolute right-4 top-3.5"
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text className="text-text-secondary text-[15px]">
                  {showPassword ? t("common.hide") : t("common.show")}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Error */}
          {error && (
            <Text className="text-error text-[15px] mb-4">{error}</Text>
          )}

          {/* Login Button */}
          <Pressable
            className={`rounded-xl py-4 items-center mb-6 ${
              isValid && !loading ? "bg-primary" : "bg-primary/40"
            }`}
            onPress={handleLogin}
            disabled={!isValid || loading}
          >
            <Text className="text-white font-semibold text-base">
              {loading ? "..." : t("auth.loginButton")}
            </Text>
          </Pressable>

          {/* Divider */}
          <View className="flex-row items-center mb-6">
            <View className="flex-1 h-px bg-surface-tertiary" />
            <Text className="mx-4 text-text-tertiary text-[15px]">{t("auth.orDivider")}</Text>
            <View className="flex-1 h-px bg-surface-tertiary" />
          </View>

          {/* Social Login */}
          <Pressable
            className="border border-surface-tertiary rounded-xl py-3.5 items-center mb-3"
            onPress={() => handleSocialLogin("google")}
            disabled={loading}
          >
            <Text className="text-text font-medium text-base">{t("auth.socialGoogle")}</Text>
          </Pressable>
          <Pressable
            className="border border-surface-tertiary rounded-xl py-3.5 items-center mb-8"
            onPress={() => handleSocialLogin("apple")}
            disabled={loading}
          >
            <Text className="text-text font-medium text-base">{t("auth.socialApple")}</Text>
          </Pressable>

          {/* Sign Up Link */}
          <View className="flex-row justify-center">
            <Text className="text-text-secondary text-[15px]">{t("auth.noAccount")} </Text>
            <Pressable onPress={() => navigation.navigate("SignUp")}>
              <Text className="text-primary text-[15px] font-semibold">{t("auth.signUp")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

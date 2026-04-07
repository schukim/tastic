import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../../types/navigation";
import type { ContentCategory } from "../../types/database";
import { CategoryChip } from "../../components/common/CategoryChip";
import { signUp } from "../../services/auth";

type Nav = NativeStackNavigationProp<AuthStackParamList, "SignUp">;

const ALL_CATEGORIES: ContentCategory[] = [
  "movie", "music", "book", "art", "exhibition", "performance",
];

export function SignUpScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();

  // Step 1 state
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  // Step 2 state
  const [nickname, setNickname] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<ContentCategory[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation
  const emailValid = email.includes("@") && email.includes(".");
  const passwordValid = password.length >= 8;
  const passwordMatch = password === passwordConfirm;
  const step1Valid = emailValid && passwordValid && passwordMatch;
  const step2Valid = nickname.trim().length > 0 && selectedCategories.length > 0;

  const toggleCategory = (cat: ContentCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleSignUp = async () => {
    if (!step2Valid) return;
    setLoading(true);
    setError(null);
    try {
      await signUp({
        email,
        password,
        nickname: nickname.trim(),
        preferredCategories: selectedCategories,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Sign up failed";
      setError(message);
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
          className="flex-1 px-6"
          contentContainerClassName="pt-12 pb-8"
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <Text className="text-primary text-3xl font-bold mb-2">{t("app.name")}</Text>
          <Text className="text-text-secondary text-base mb-8">
            {step === 1 ? t("auth.step1Title") : t("auth.step2Title")}
          </Text>

          {/* Step indicator */}
          <View className="flex-row mb-8">
            <View className={`flex-1 h-1 rounded mr-2 ${step >= 1 ? "bg-primary" : "bg-surface-tertiary"}`} />
            <View className={`flex-1 h-1 rounded ${step >= 2 ? "bg-primary" : "bg-surface-tertiary"}`} />
          </View>

          {step === 1 ? (
            <>
              {/* Email */}
              <View className="mb-4">
                <Text className="text-text-secondary text-sm mb-1.5">{t("auth.email")}</Text>
                <TextInput
                  className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3.5 text-text text-base"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
                {email.length > 0 && !emailValid && (
                  <Text className="text-error text-xs mt-1">{t("auth.emailInvalid")}</Text>
                )}
              </View>

              {/* Password */}
              <View className="mb-4">
                <Text className="text-text-secondary text-sm mb-1.5">{t("auth.password")}</Text>
                <TextInput
                  className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3.5 text-text text-base"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
                {password.length > 0 && !passwordValid && (
                  <Text className="text-error text-xs mt-1">{t("auth.passwordMinLength")}</Text>
                )}
              </View>

              {/* Password Confirm */}
              <View className="mb-6">
                <Text className="text-text-secondary text-sm mb-1.5">{t("auth.passwordConfirm")}</Text>
                <TextInput
                  className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3.5 text-text text-base"
                  value={passwordConfirm}
                  onChangeText={setPasswordConfirm}
                  secureTextEntry
                />
                {passwordConfirm.length > 0 && !passwordMatch && (
                  <Text className="text-error text-xs mt-1">
                    {t("auth.passwordConfirm")}
                  </Text>
                )}
              </View>

              {/* Next */}
              <Pressable
                className={`rounded-xl py-4 items-center ${step1Valid ? "bg-primary" : "bg-primary/40"}`}
                onPress={() => step1Valid && setStep(2)}
                disabled={!step1Valid}
              >
                <Text className="text-white font-semibold text-base">{t("auth.next")}</Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* Nickname */}
              <View className="mb-6">
                <Text className="text-text-secondary text-sm mb-1.5">{t("auth.nickname")}</Text>
                <TextInput
                  className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3.5 text-text text-base"
                  value={nickname}
                  onChangeText={setNickname}
                  autoCapitalize="none"
                />
              </View>

              {/* Categories */}
              <View className="mb-6">
                <Text className="text-text-secondary text-sm mb-3">{t("auth.selectCategories")}</Text>
                <View className="flex-row flex-wrap">
                  {ALL_CATEGORIES.map((cat) => (
                    <CategoryChip
                      key={cat}
                      category={cat}
                      selected={selectedCategories.includes(cat)}
                      onPress={toggleCategory}
                    />
                  ))}
                </View>
              </View>

              {/* Error */}
              {error && <Text className="text-error text-sm mb-4">{error}</Text>}

              {/* Start */}
              <Pressable
                className={`rounded-xl py-4 items-center ${step2Valid && !loading ? "bg-primary" : "bg-primary/40"}`}
                onPress={handleSignUp}
                disabled={!step2Valid || loading}
              >
                <Text className="text-white font-semibold text-base">
                  {loading ? "..." : t("auth.startButton")}
                </Text>
              </Pressable>
            </>
          )}

          {/* Back to Login */}
          <View className="flex-row justify-center mt-6">
            <Text className="text-text-secondary text-sm">{t("auth.hasAccount")} </Text>
            <Pressable onPress={() => navigation.navigate("Login")}>
              <Text className="text-primary text-sm font-semibold">{t("auth.login")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

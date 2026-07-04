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
import { signUp, resendConfirmation } from "../../services/auth";

type Nav = NativeStackNavigationProp<AuthStackParamList, "SignUp">;

export function SignUpScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();

  // Step state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  // Step 2 state
  const [nickname, setNickname] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation
  const emailValid = email.includes("@") && email.includes(".");
  const passwordValid = password.length >= 8;
  const passwordMatch = password === passwordConfirm;
  const step1Valid = emailValid && passwordValid && passwordMatch;
  const step2Valid = nickname.trim().length > 0;

  // 이메일 인증 완료 시 SIGNED_IN 이벤트로 RootNavigator 가 알아서 Main/온보딩으로
  // 전환하므로 별도 리스너를 두지 않는다. (기존 TOKEN_REFRESHED → Login 강제 이동은
  // 인증과 무관한 토큰 갱신에도 발동해 대기 화면에서 튕기는 문제가 있어 제거)

  const handleSignUp = async () => {
    if (!step2Valid) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signUp({
        email,
        password,
        nickname: nickname.trim(),
      });

      console.log('회원가입 결과:', result);

      // 회원가입 성공 - 이메일 확인 단계로 이동
      setStep(3);

    } catch (e: unknown) {
      console.error('회원가입 에러:', e);
      const message = e instanceof Error ? e.message : "회원가입에 실패했습니다";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    try {
      setLoading(true);
      await resendConfirmation(email);
      Alert.alert(
        t("auth.resendEmailSuccessTitle"),
        t("auth.resendEmailSuccess"),
        [{ text: t("common.confirm") }]
      );
    } catch (e: unknown) {
      console.error('이메일 재전송 에러:', e);
      const message = e instanceof Error ? e.message : t("auth.resendEmailFailed");
      Alert.alert(t("auth.resendEmailFailedTitle"), message, [{ text: t("common.confirm") }]);
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
            {step === 1 ? t("auth.step1Title") :
             step === 2 ? t("auth.step2Title") :
             t("auth.step3Title")}
          </Text>

          {/* Step indicator */}
          <View className="flex-row mb-8">
            <View className={`flex-1 h-1 rounded mr-1 ${step >= 1 ? "bg-primary" : "bg-surface-tertiary"}`} />
            <View className={`flex-1 h-1 rounded mx-1 ${step >= 2 ? "bg-primary" : "bg-surface-tertiary"}`} />
            <View className={`flex-1 h-1 rounded ml-1 ${step >= 3 ? "bg-primary" : "bg-surface-tertiary"}`} />
          </View>

          {step === 1 ? (
            <>
              {/* Email */}
              <View className="mb-4">
                <Text className="text-text-secondary text-[15px] mb-1.5">{t("auth.email")}</Text>
                <TextInput
                  className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3.5 text-text text-base"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
                {email.length > 0 && !emailValid && (
                  <Text className="text-error text-[13px] mt-1">{t("auth.emailInvalid")}</Text>
                )}
              </View>

              {/* Password */}
              <View className="mb-4">
                <Text className="text-text-secondary text-[15px] mb-1.5">{t("auth.password")}</Text>
                <TextInput
                  className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3.5 text-text text-base"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
                {password.length > 0 && !passwordValid && (
                  <Text className="text-error text-[13px] mt-1">{t("auth.passwordMinLength")}</Text>
                )}
              </View>

              {/* Password Confirm */}
              <View className="mb-6">
                <Text className="text-text-secondary text-[15px] mb-1.5">{t("auth.passwordConfirm")}</Text>
                <TextInput
                  className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3.5 text-text text-base"
                  value={passwordConfirm}
                  onChangeText={setPasswordConfirm}
                  secureTextEntry
                />
                {passwordConfirm.length > 0 && !passwordMatch && (
                  <Text className="text-error text-[13px] mt-1">
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
          ) : step === 2 ? (
            <>
              {/* Nickname */}
              <View className="mb-6">
                <Text className="text-text-secondary text-[15px] mb-1.5">{t("auth.nickname")}</Text>
                <TextInput
                  className="bg-surface-secondary border border-surface-tertiary rounded-xl px-4 py-3.5 text-text text-base"
                  value={nickname}
                  onChangeText={setNickname}
                  autoCapitalize="none"
                />
              </View>

              {/* Error */}
              {error && <Text className="text-error text-[15px] mb-4">{error}</Text>}

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
          ) : (
            <>
              {/* Step 3: Email Verification */}
              <View className="items-center mb-8">
                <Text className="text-6xl mb-4">📧</Text>
                <Text className="text-text text-lg font-semibold mb-2">{t("auth.emailVerificationTitle")}</Text>
                <Text className="text-text-secondary text-center text-base mb-4">
                  {t("auth.emailVerificationMessage", { email })}
                </Text>

                <View className="bg-surface-secondary rounded-xl p-4 mb-6">
                  <Text className="text-text-secondary text-[15px] text-center">
                    {t("auth.emailVerificationTip")}
                  </Text>
                </View>
              </View>

              {/* 이메일 재전송 버튼 */}
              <Pressable
                className={`border border-primary rounded-xl py-4 items-center mb-4 ${loading ? "opacity-50" : ""}`}
                onPress={() => {
                  Alert.alert(
                    t("auth.resendEmailTitle"),
                    t("auth.resendEmailConfirm"),
                    [
                      { text: t("common.cancel") },
                      { text: t("common.confirm"), onPress: handleResendEmail }
                    ]
                  );
                }}
                disabled={loading}
              >
                <Text className="text-primary font-semibold text-base">
                  {loading ? "..." : t("auth.resendEmail")}
                </Text>
              </Pressable>

              {/* 로그인 화면으로 이동 */}
              <Pressable
                className="bg-primary rounded-xl py-4 items-center"
                onPress={() => navigation.navigate("Login")}
              >
                <Text className="text-white font-semibold text-base">{t("auth.goToLogin")}</Text>
              </Pressable>
            </>
          )}

          {/* Back to Login */}
          <View className="flex-row justify-center mt-6">
            <Text className="text-text-secondary text-[15px]">{t("auth.hasAccount")} </Text>
            <Pressable onPress={() => navigation.navigate("Login")}>
              <Text className="text-primary text-[15px] font-semibold">{t("auth.login")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

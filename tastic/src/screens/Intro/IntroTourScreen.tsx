import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ImageSourcePropType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../stores/authStore";
import { markIntroSeen } from "../../services/profile";

// 앱 첫 실행 기능 가이드 — 마케팅 스크린샷(헤드라인·목업 내장)을 슬라이드로 재활용한다.
// 이미지는 ko/en 두 벌이 있어 사용자 언어에 맞는 세트를 보여준다.
// (require 는 정적 리터럴이어야 하므로 언어별 배열을 미리 정의)
const SLIDES: Record<"ko" | "en", ImageSourcePropType[]> = {
  ko: [
    require("../../../assets/intro/intro-1-ko.png"),
    require("../../../assets/intro/intro-2-ko.png"),
    require("../../../assets/intro/intro-3-ko.png"),
  ],
  en: [
    require("../../../assets/intro/intro-1-en.png"),
    require("../../../assets/intro/intro-2-en.png"),
    require("../../../assets/intro/intro-3-en.png"),
  ],
};

// 온보딩 배경은 이미지(밝은 warm 톤)에 맞춰 항상 라이트로 고정한다.
const BG = "#F8F6F1"; // surface.DEFAULT
const INK = "#221F1A"; // primary.DEFAULT
const INK_TEXT = "#FDFCF9"; // surface.secondary — 버튼 위 텍스트
const DOT = "#D8D3CB"; // 비활성 도트
const SUBTLE = "#9C9589"; // text.tertiary

export function IntroTourScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const user = useAuthStore((s) => s.user);
  const lang: "ko" | "en" = user?.language === "en" ? "en" : "ko";
  const slides = SLIDES[lang];

  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === slides.length - 1;

  const finish = useCallback(() => {
    // markIntroSeen 이 authStore.user.intro_seen 을 즉시 true 로 바꿔
    // RootNavigator 가 Main 으로 전환한다. 서버 반영 실패는 UX 를 막지 않는다.
    markIntroSeen().catch(() => {});
  }, []);

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      if (next !== index) setIndex(next);
    },
    [index, width],
  );

  const handleNext = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    const next = index + 1;
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  }, [isLast, index, width, finish]);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
      >
        {slides.map((src, i) => (
          <Image
            key={i}
            source={src}
            style={{ width, height }}
            resizeMode="contain"
          />
        ))}
      </ScrollView>

      {/* Skip — 마지막 슬라이드 제외 */}
      {!isLast && (
        <Pressable
          onPress={finish}
          hitSlop={12}
          style={{ position: "absolute", top: insets.top + 8, right: 20 }}
        >
          <Text style={{ color: SUBTLE, fontSize: 15, fontWeight: "600" }}>
            {t("intro.skip")}
          </Text>
        </Pressable>
      )}

      {/* 하단 컨트롤 바 */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: insets.bottom + 20,
          paddingTop: 20,
          paddingHorizontal: 28,
          backgroundColor: BG,
        }}
      >
        {/* 페이지 도트 */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          {slides.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === index ? 22 : 7,
                height: 7,
                borderRadius: 4,
                marginHorizontal: 3,
                backgroundColor: i === index ? INK : DOT,
              }}
            />
          ))}
        </View>

        <Pressable
          onPress={handleNext}
          android_ripple={{ color: "rgba(255,255,255,0.15)" }}
          style={{
            backgroundColor: INK,
            borderRadius: 18,
            paddingVertical: 17,
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
          }}
        >
          <Text style={{ color: INK_TEXT, fontSize: 16, fontWeight: "700" }}>
            {isLast ? t("intro.start") : t("intro.next")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

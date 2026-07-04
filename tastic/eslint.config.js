// Expo 기본 ESLint 플랫 컨피그 — `npm run lint` 로 실행
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/*",
      "android/*",
      "ios/*",
      "e2e/*",
      // Deno 런타임(Edge Functions)은 별도 환경이라 RN용 lint 대상에서 제외
      "supabase/functions/*",
    ],
  },
  {
    rules: {
      // Reanimated 공유값은 `sv.value = ...` 쓰기가 공식 API — 컴파일러 규칙과 충돌하므로 끔
      "react-hooks/immutability": "off",
      // 기존 코드 패턴(훅 반환에서 ref 읽기, 초기화 effect 내 setState)은 경고로만
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

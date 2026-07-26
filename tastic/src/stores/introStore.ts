import { create } from "zustand";

// 기능 가이드(온보딩 투어) 노출 여부 — 기기 로컬(AsyncStorage) 값을 미러링한다.
// seen=null 은 "아직 AsyncStorage 를 읽지 않음"(부팅 직후)을 뜻해, 이 동안에는
// 인트로/로그인 어느 쪽도 깜빡이지 않도록 로딩으로 처리한다.
interface IntroState {
  seen: boolean | null;
  setSeen: (seen: boolean) => void;
}

export const useIntroStore = create<IntroState>((set) => ({
  seen: null,
  setSeen: (seen) => set({ seen }),
}));

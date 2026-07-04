import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_KEY = "@tastic/theme";

interface ThemeState {
  isDark: boolean;
  setDark: (dark: boolean) => void;
  toggle: () => void;
  init: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: false,
  setDark: (isDark) => {
    set({ isDark });
    AsyncStorage.setItem(THEME_KEY, isDark ? "dark" : "light").catch(() => {});
  },
  toggle: () => get().setDark(!get().isDark),
  init: async () => {
    try {
      const saved = await AsyncStorage.getItem(THEME_KEY);
      if (saved) {
        set({ isDark: saved === "dark" });
      } else {
        // 기본값: 라이트모드 (시스템 설정 무시)
        set({ isDark: false });
      }
    } catch {
      // ignore — default to light
      set({ isDark: false });
    }
  },
}));

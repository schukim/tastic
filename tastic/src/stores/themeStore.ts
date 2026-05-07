import { create } from "zustand";
import { Appearance } from "react-native";
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
        set({ isDark: Appearance.getColorScheme() === "dark" });
      }
    } catch {
      // ignore — default to light
    }
  },
}));

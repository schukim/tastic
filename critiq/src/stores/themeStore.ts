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
    Appearance.setColorScheme(isDark ? "dark" : "light");
    AsyncStorage.setItem(THEME_KEY, isDark ? "dark" : "light").catch(() => {});
  },
  toggle: () => get().setDark(!get().isDark),
  init: async () => {
    try {
      const saved = await AsyncStorage.getItem(THEME_KEY);
      if (saved) {
        const isDark = saved === "dark";
        set({ isDark });
        Appearance.setColorScheme(isDark ? "dark" : "light");
      } else {
        const isDark = Appearance.getColorScheme() === "dark";
        set({ isDark });
        Appearance.setColorScheme(isDark ? "dark" : "light");
      }
    } catch {
      // ignore — default to light
    }
  },
}));

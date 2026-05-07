import { useEffect } from "react";
import { useColorScheme } from "nativewind";
import { useThemeStore } from "../stores/themeStore";

/**
 * Theme hook that connects themeStore with NativeWind's colorScheme
 * This ensures dark mode classes work properly with the theme toggle
 */
export function useTheme() {
  const { isDark, setDark, toggle, init } = useThemeStore();
  const { setColorScheme } = useColorScheme();

  // Sync NativeWind colorScheme with our theme store
  useEffect(() => {
    setColorScheme(isDark ? "dark" : "light");
  }, [isDark, setColorScheme]);

  // Initialize theme on app start
  useEffect(() => {
    init();
  }, [init]);

  return {
    isDark,
    setDark,
    toggle,
    // Computed classes for dynamic application
    colorScheme: isDark ? "dark" : "",
  };
}

/**
 * Utility to get theme-aware className
 * Usage: cn(getThemeClasses("bg-surface", isDark))
 */
export function getThemeClasses(lightClass: string, isDark: boolean): string {
  return isDark ? `dark ${lightClass}` : lightClass;
}
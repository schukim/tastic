/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#6366F1",
          light: "#818CF8",
          dark: "#4F46E5",
        },
        category: {
          movie: "#EF4444",
          music: "#3B82F6",
          book: "#22C55E",
          art: "#EAB308",
          exhibition: "#A855F7",
          performance: "#EC4899",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          secondary: "#F8FAFC",
          tertiary: "#F1F5F9",
        },
        text: {
          DEFAULT: "#1E293B",
          secondary: "#64748B",
          tertiary: "#94A3B8",
        },
        error: "#EF4444",
        success: "#22C55E",
        dim: "rgba(0, 0, 0, 0.5)",
      },
    },
  },
  plugins: [],
};

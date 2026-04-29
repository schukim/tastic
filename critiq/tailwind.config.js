/** @type {import('tailwindcss').Config} */
// Tastic Design System — Tailwind config
// Generated from design system token finalization (April 2026)

module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Pretendard", "Noto Sans KR", "System"],
      },
      colors: {
        // ── Brand / Primary ──────────────────────────────
        primary: {
          DEFAULT: "#221F1A",   // deep warm ink
          light:   "#6B6560",   // muted warm gray
          dark:    "#0F0D0A",   // near-black pressed
        },

        // ── Category colors — desaturated ink tones ──────
        category: {
          movie:       "#5C2E2E",   // dark wine / burgundy
          music:       "#2E3D4F",   // dark steel blue
          book:        "#3D4A2E",   // moss green / olive
          art:         "#5C4A2E",   // dark ochre / mustard
          exhibition:  "#3D2E4A",   // muted plum
          performance: "#5C3D2E",   // terracotta
        },

        // ── Dark-mode category colors ────────────────────
        "category-dark": {
          movie:       "#A85A5A",   // muted rose
          music:       "#5A7A96",   // muted slate blue
          book:        "#7A9660",   // muted sage
          art:         "#96785A",   // muted tan ochre
          exhibition:  "#7A6096",   // muted lavender
          performance: "#96705A",   // muted terracotta light
        },

        // ── Surfaces (light mode) ────────────────────────
        surface: {
          DEFAULT:   "#F8F6F1",   // main bg — warm paper white
          secondary: "#FDFCF9",   // cards / inputs — near-white warm
          tertiary:  "#F1EFE9",   // chips / dividers — warm light gray
          border:    "#EAE7E0",   // hairline border
        },

        // ── Surfaces (dark mode) ─────────────────────────
        "surface-dark": {
          DEFAULT:   "#1A1814",   // main bg
          secondary: "#221F1A",   // cards / inputs
          tertiary:  "#2A2620",   // dividers / chips
          border:    "#333028",   // hairline border
        },

        // ── Text (light mode) ────────────────────────────
        text: {
          DEFAULT:   "#1E1B17",   // warm charcoal
          secondary: "#6B6358",   // warm mid gray
          tertiary:  "#9C9589",   // placeholder / timestamps
        },

        // ── Text (dark mode) ─────────────────────────────
        "text-dark": {
          DEFAULT:   "#E8E4DB",   // warm off-white
          secondary: "#B0A99E",   // warm mid light
          tertiary:  "#7A7268",   // warm gray
        },

        // ── Semantic ──────────────────────────────────────
        error:   "#7A3030",   // deep red (distinct from movie #5C2E2E)
        warning: "#7A6030",   // dark amber
        success: "#3A6040",   // dark teal-green (distinct from book #3D4A2E)
        info:    "#30507A",   // dark steel blue (distinct from music #2E3D4F)

        // ── Dim overlay ───────────────────────────────────
        dim: "rgba(0, 0, 0, 0.5)",
      },
    },
  },
  plugins: [],
};
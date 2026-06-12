import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        synergy: { DEFAULT: "#7aa83a", dark: "#5f8a2a" },
        pharma: { DEFAULT: "#15a7e0", dark: "#0d86b8" },
        ink: "#1d2433",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;

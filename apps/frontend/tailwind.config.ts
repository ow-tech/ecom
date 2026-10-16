import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: { colors: { page: "var(--surface-page)", surface: "var(--surface-card)", muted: "var(--surface-muted)", foreground: "var(--text-primary)", "foreground-muted": "var(--text-secondary)", border: "var(--border-default)", primary: "var(--brand-primary)", secondary: "var(--brand-secondary)", accent: "var(--brand-action)", success: "var(--success)", warning: "var(--warning)", destructive: "var(--danger)", info: "var(--info)" } },
  },
  plugins: [],
};

export default config;

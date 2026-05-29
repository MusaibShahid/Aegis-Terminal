/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0b0d17",
          alt: "#111322",
          hover: "#1c1f34",
          border: "#1e2240",
          "border-light": "#2a2f55",
          card: "#161928",
          input: "#0f1120",
        },
        accent: {
          green: "#22c55e",
          "green-dim": "#16a34a",
          red: "#ef4444",
          "red-dim": "#dc2626",
          blue: "#3b82f6",
          "blue-dim": "#2563eb",
          yellow: "#f59e0b",
          purple: "#a855f7",
          cyan: "#06b6d4",
          orange: "#f97316",
        },
        text: {
          primary: "#e1e4ed",
          secondary: "#8b90a5",
          tertiary: "#5c6077",
          muted: "#3d4059",
        },
        glass: {
          white: "rgba(255, 255, 255, 0.04)",
          "white-hover": "rgba(255, 255, 255, 0.08)",
          border: "rgba(255, 255, 255, 0.06)",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
        sans: ['"Inter"', "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      fontSize: {
        xxs: ["10px", { lineHeight: "12px", letterSpacing: "0.02em" }],
        xs: ["11px", { lineHeight: "14px" }],
        sm: ["12px", { lineHeight: "16px" }],
        base: ["13px", { lineHeight: "18px" }],
        lg: ["14px", { lineHeight: "20px" }],
        xl: ["16px", { lineHeight: "24px" }],
      },
      spacing: {
        0.5: "2px",
        1: "4px",
        1.5: "6px",
        2: "8px",
        2.5: "10px",
        3: "12px",
        4: "16px",
        5: "20px",
        6: "24px",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        xl: "12px",
      },
      boxShadow: {
        sm: "0 1px 3px rgba(0, 0, 0, 0.3)",
        DEFAULT: "0 2px 8px rgba(0, 0, 0, 0.3)",
        md: "0 4px 12px rgba(0, 0, 0, 0.4)",
        lg: "0 8px 24px rgba(0, 0, 0, 0.5)",
        glass: "0 0 20px rgba(0, 0, 0, 0.4)",
        glow: "0 0 12px rgba(59, 130, 246, 0.2)",
        "glow-green": "0 0 12px rgba(34, 197, 94, 0.2)",
        "glow-red": "0 0 12px rgba(239, 68, 68, 0.2)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.15s ease-out",
        "slide-up": "slideUp 0.2s ease-out",
        "scale-in": "scaleIn 0.15s ease-out",
        shimmer: "shimmer 2s infinite linear",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

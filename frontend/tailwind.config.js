/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0a0b14",
          alt: "#12142a",
          hover: "#1a1d3a",
          border: "#1e2048",
          "border-light": "#2a2d5a",
        },
        accent: {
          green: "#00d97c",
          "green-dim": "#00b86b",
          red: "#ff4757",
          "red-dim": "#e03845",
          blue: "#4d7cff",
          "blue-dim": "#3b66e0",
          yellow: "#ffc53d",
          purple: "#9b59ff",
          cyan: "#00d4ff",
          orange: "#ff8c42",
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
        xxs: ["10px", "12px"],
        xs: ["11px", "14px"],
        sm: ["12px", "16px"],
        base: ["13px", "18px"],
      },
      boxShadow: {
        glass: "0 0 20px rgba(0, 0, 0, 0.4)",
        glow: "0 0 12px rgba(77, 124, 255, 0.25)",
        "glow-green": "0 0 12px rgba(0, 217, 124, 0.25)",
        "glow-red": "0 0 12px rgba(255, 71, 87, 0.25)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-out",
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

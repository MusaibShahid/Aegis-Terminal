/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/ws": {
        target: "ws://127.0.0.1:8000",
        ws: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    // Benchmark-related env vars are automatically exposed via VITE_ prefix
    // No special bench config needed — vitest 4.x runs .bench.test.* files
    // alongside regular tests with `vitest run`, or standalone with `vitest bench`.
  },
});

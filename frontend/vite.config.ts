import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/\/node_modules\/(recharts|d3-[^/]+)\//.test(id)) return "charts";
          if (/\/node_modules\/(leaflet|react-leaflet|@react-leaflet\/[^/]+)\//.test(id)) return "map";
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react-vendor";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    restoreMocks: true,
  },
});

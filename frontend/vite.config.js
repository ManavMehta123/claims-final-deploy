import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiBase = process.env.VITE_API_BASE_URL || "http://localhost:5000";
const proxyTarget = apiBase.replace(/\/api\/?$/, "");

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
      },
      "/health": {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
});

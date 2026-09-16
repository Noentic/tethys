import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri expects the dev server on a fixed port (see src-tauri/tauri.conf.json).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: "dist",
  },
});

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri expects the dev server on a fixed port (see src-tauri/tauri.conf.json).
export default defineConfig({
  plugins: [tailwindcss(), react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  // The diff highlighter's worker lazily imports Shiki, which needs code
  // splitting, and Vite's default `iife` worker format cannot do that. The
  // client already starts it as `{ type: "module" }`.
  worker: {
    format: "es",
  },
  build: {
    outDir: "dist",
  },
});

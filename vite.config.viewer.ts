import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  build: {
    outDir: "dist-viewer",
    emptyOutDir: true,
    rollupOptions: {
      // Key `index` emits `index.html` (Tauri expects this in frontendDist).
      input: { index: path.resolve(__dirname, "viewer.html") },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**", "**/viewer-tauri/**"],
    },
  },
});

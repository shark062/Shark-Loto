import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const basePath = process.env.BASE_PATH || "/";
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5000;

const isReplit = !!process.env.REPL_ID;

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "src", "shared"),
      "@assets": path.resolve(import.meta.dirname, "src", "assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    // Desabilita minificação do CSS pelo Lightning CSS que remove backdrop-filter
    cssMinify: false,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.message.includes("sourcemap")) return;
        warn(warning);
      },
      output: {
        manualChunks: {
          ui: ["framer-motion", "lucide-react", "recharts"],
          forms: ["react-hook-form", "@hookform/resolvers", "zod"],
          pdf: ["jspdf"],
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: isReplit
      ? { protocol: "wss", clientPort: 443 }
      : true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        ws: false,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});

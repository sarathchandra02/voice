import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["@web-ppt/core", "mammoth", "fflate", "dompurify"],
  },
  server: { port: 5173, strictPort: true },
});

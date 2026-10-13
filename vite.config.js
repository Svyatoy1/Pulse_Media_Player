import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    strictPort: true,
    port: 5173
  }
});

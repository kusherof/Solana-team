import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { "process.env": {}, global: "globalThis" },
  resolve: {
    // sdk/ лежит в корне проекта — заставляем его использовать те же копии библиотек, что и app
    dedupe: ["@solana/wallet-adapter-react", "@coral-xyz/anchor", "@solana/web3.js", "@solana/spl-token", "bn.js", "decimal.js", "buffer"],
    alias: { buffer: "buffer/" },
  },
  server: { fs: { allow: [".."] } },
  optimizeDeps: { include: ["buffer"] },
});

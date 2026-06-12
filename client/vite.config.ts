import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const shared = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url));

export default defineConfig({
  base: './', // relative assets — works at / (node server) and /<repo>/ (GitHub Pages)
  resolve: {
    alias: { '@park/shared': shared },
  },
  server: {
    port: 5173,
    proxy: {
      // dev: ws relay runs on :3001; client always connects to same-origin /ws
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
  build: { outDir: 'dist', target: 'es2022' },
});

import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'src/ui',
  // 相対パスで出すので、どのホスティング先／サブパスに置いても動く
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173, open: false },
  build: { outDir: '../../dist', emptyOutDir: true },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, '../dist/webview'),
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: resolve(__dirname, 'src/main.tsx'),
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (info) => (info.names?.some((n) => n.endsWith('.css')) ? 'assets/index.css' : 'assets/[name]-[hash][extname]'),
      },
    },
  },
});

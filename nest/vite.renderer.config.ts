import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  build: {
    outDir: '.vite/renderer',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: 'src/renderer/index.html',
    },
  },
  resolve: {
    alias: {
      '@shared': '/src/shared',
      '@main': '/src/main',
      '@renderer': '/src/renderer',
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

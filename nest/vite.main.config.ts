import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/index.ts',
      formats: ['cjs'],
      fileName: 'main',
    },
    rollupOptions: {
      external: ['electron', 'better-sqlite3'],
      output: {
        entryFileNames: '[name].js',
      },
    },
    outDir: '.vite/build',
    emptyOutDir: true,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@shared': '/src/shared',
      '@main': '/src/main',
      '@renderer': '/src/renderer',
    },
  },
});

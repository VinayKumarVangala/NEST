import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/preload/index.ts',
      formats: ['cjs'],
      fileName: 'preload',
    },
    rollupOptions: {
      external: ['electron'],
      output: {
        entryFileNames: '[name].js',
      },
    },
    outDir: '.vite/build',
    emptyOutDir: false,
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

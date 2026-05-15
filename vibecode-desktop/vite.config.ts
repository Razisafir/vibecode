import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Monaco editor — large, rarely changes, cache separately
          monaco: ['monaco-editor'],
          // React core — separate from app code for better caching
          'react-vendor': ['react', 'react-dom'],
          // xterm.js — terminal emulator, separate chunk
          xterm: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links', '@xterm/addon-search'],
        },
      },
    },
    // Enable minification for production
    minify: 'esbuild',
    // Target modern browsers for smaller bundles
    target: 'esnext',
    // Disable sourcemaps in production for smaller bundle
    sourcemap: false,
    // Chunk size warning limit
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: 'VIBECODE_',
  optimizeDeps: {
    include: ['monaco-editor', 'react', 'react-dom'],
  },
});

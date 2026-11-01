import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works when served from a subpath (e.g. itch.io, GitHub Pages).
  base: './',
  server: {
    port: 5173,
    open: false
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    target: 'es2020',
    sourcemap: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          // Split Phaser into its own vendor chunk for better caching.
          'phaser-vendor': ['phaser']
        }
      }
    }
  }
});

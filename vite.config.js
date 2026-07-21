import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: 'public-v2',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2022',
    chunkSizeWarningLimit: 2_200,
    rolldownOptions: {
      output: {
        // Babylon's shader modules otherwise become ~100 tiny preload requests.
        codeSplitting: false,
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  }
});

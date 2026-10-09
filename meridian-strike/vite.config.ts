import { defineConfig } from 'vite';

// COOP/COEP enable SharedArrayBuffer for the sim worker (used from M1).
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});

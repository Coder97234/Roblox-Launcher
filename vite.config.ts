import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The UI talks to the Xenity backend (server/) over a single origin: the dev
// server proxies /api to the API service so the browser preview, cookies and
// fetch() calls all stay same-origin.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.XENITY_API_URL || 'http://api:8000',
        changeOrigin: true,
      },
    },
  },
});

// Temporary local QA config: same app, but /api is proxied to the local
// FastAPI server instead of production. Deleted after the QA pass.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5179, proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } } },
});

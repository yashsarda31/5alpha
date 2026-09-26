import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5178, allowedHosts: ['.trycloudflare.com', 'alphanova48.in', 'www.alphanova48.in'], proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } } },
  preview: { host: '127.0.0.1', port: 4178, allowedHosts: ['.trycloudflare.com', 'alphanova48.in', 'www.alphanova48.in'], proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } } },
});

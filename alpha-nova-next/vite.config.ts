import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5178, proxy: { '/api': { target: 'https://alphanova48.in', changeOrigin: true } } },
  preview: { host: '127.0.0.1', port: 4178, proxy: { '/api': { target: 'https://alphanova48.in', changeOrigin: true } } },
});

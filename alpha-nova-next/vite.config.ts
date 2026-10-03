import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');
const backend = { target: 'http://127.0.0.1:8000', changeOrigin: true };
const proxy = {
  '/api': backend,
  '^/high-delivery-volume-stocks-today/?$': backend,
  '^/stocks/[^/]+/delivery-percentage/?$': backend,
  '^/s/[^/]+/?$': backend,
};

function localPreviewPages(): Plugin {
  return {
    name: 'alpha-nova-local-preview-pages',
    configurePreviewServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (!request.url || !['GET', 'HEAD'].includes(request.method || '')) return next();
        const { pathname, search } = new URL(request.url, 'http://localhost');
        if (!/^\/[a-z0-9/-]+\/?$/.test(pathname) || pathname.includes('..')) return next();
        if (/^\/(?:high-delivery-volume-stocks-today|s\/[^/]+|stocks\/[^/]+\/delivery-percentage)\/?$/.test(pathname)) return next();
        const route = pathname.replace(/^\/+|\/+$/g, '');
        if (route && existsSync(resolve(distDir, route, 'index.html'))) {
          request.url = `/${route}/index.html${search}`;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localPreviewPages()],
  server: { host: '127.0.0.1', port: 5178, allowedHosts: ['.trycloudflare.com', 'alphanova48.in', 'www.alphanova48.in', 'abovealphasolutions.com', 'www.abovealphasolutions.com'], proxy },
  preview: { host: '127.0.0.1', port: 4178, allowedHosts: ['.trycloudflare.com', 'alphanova48.in', 'www.alphanova48.in', 'abovealphasolutions.com', 'www.abovealphasolutions.com'], proxy },
});

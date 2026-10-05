import { createServer } from 'vite';
let count = 0;
const server = await createServer({ server: { host: '127.0.0.1', port: 5186, strictPort: true }, plugins: [{
  name: 'hardening-fixtures', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      const url = new URL(req.url, 'http://localhost');
      const market = url.searchParams.get('market');
      const request = ++count;
      setTimeout(() => {
        res.statusCode = market === 'FAIL' ? 503 : 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(url.pathname === '/api/symbol-search' ? { results: [{ symbol: market === 'US' ? 'TEST' : 'TEST.NS', name: `${market} test company` }] } : { request, market }));
      }, market === 'SLOW' ? 14000 : url.pathname === '/api/symbol-search' ? 1800 : 400);
    });
  },
}] });
await server.listen();
console.log('Hardening fixture http://127.0.0.1:5186/tests/hardening-harness.html');

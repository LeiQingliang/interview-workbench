import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build, root } from './build.mjs';

await build();
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be between 1 and 65535.');
const routes = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/interview-workbench.html', 'interview-workbench.html'],
]);
const server = createServer(async (req, res) => {
  let route;
  try {
    route = new URL(req.url, 'http://localhost').pathname;
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method) || !routes.has(route)) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const data = await readFile(path.join(root, 'dist', routes.get(route)));
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(500).end('Unable to read the built page');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Interview Workbench: http://127.0.0.1:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)));

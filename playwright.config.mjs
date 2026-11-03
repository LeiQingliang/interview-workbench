import { defineConfig, devices } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Keeping this tiny server here lets the build stay dependency-free and serves
// exactly the single file being tested. No source files or directory traversal.
if (process.argv.includes('--serve')) {
  const index = fileURLToPath(new URL('./dist/index.html', import.meta.url));
  createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (request.method !== 'GET' || !['/', '/index.html'].includes(path)) {
      response.writeHead(404).end('Not found');
      return;
    }
    try {
      const content = await readFile(index);
      response
        .writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        .end(content);
    } catch {
      response.writeHead(503).end('Build dist/index.html before running the browser tests.');
    }
  }).listen(4173, '127.0.0.1');
}

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/e2e.spec.mjs',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node playwright.config.mjs --serve',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 20_000,
  },
});

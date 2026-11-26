// Capture the four submission screenshots from the real game at 1280x800. Each shot is a direct
// Playwright render — no compositing, retouching or image editing. Run while `node serve.ts` is up.

import { statSync, rmSync, mkdirSync } from 'node:fs';
import { chromium } from '/tmp/opencode/pw_tool/node_modules/playwright-core/index.mjs';

const SHOTS = [
  { file: '1-chase.jpg', url: '?shot=chase', name: 'chase over the main island' },
  { file: '2-cockpit.jpg', url: '?shot=cockpit', name: 'cockpit' },
  { file: '3-ring.jpg', url: '?shot=runway', name: 'runway / gate ahead' },
  { file: '4-title.jpg', url: '?shot=title', name: 'title screen' },
];

rmSync('screenshots', { recursive: true, force: true });
mkdirSync('screenshots', { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: '/home/kozak/.local/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
const external = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('request', (request) => {
  const url = request.url();
  if (!url.startsWith('http://localhost:8080/')) external.push(url);
});

for (const shot of SHOTS) {
  await page.goto(`http://localhost:8080/${shot.url}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shotReady === true, { timeout: 30000 });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `screenshots/${shot.file}`, type: 'jpeg', quality: 86 });
  const bytes = statSync(`screenshots/${shot.file}`).size;
  const dims = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
  if (bytes > 262144) throw new Error(`${shot.file} is ${bytes} bytes, over the 256 KiB cap`);
  console.log(`${shot.file.padEnd(15)} ${shot.name.padEnd(24)} ${String(bytes).padStart(7)} bytes  ${dims.width}x${dims.height}`);
}

await browser.close();
if (errors.length > 0) {
  console.error('Console errors:', errors);
  process.exitCode = 1;
} else {
  console.log('No console errors. External requests:', external.length === 0 ? 'none' : external.join(', '));
}

// Headless verification for Skyreef Run. Run with `node tools/verify.mjs` while `node serve.ts`
// is serving game/ on http://localhost:8080. It asserts the offline request set, a live canvas,
// keyboard-driven HUD changes, view/pause controls, every game-ending path and a fresh restart,
// then reports a frame-rate sample. Exits non-zero if any check fails.

import { createHash } from 'node:crypto';
import { chromium } from '/tmp/opencode/pw_tool/node_modules/playwright-core/index.mjs';

const BASE = 'http://localhost:8080/';
const CHECKS = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const httpRequests = [];
const badResponses = [];

function check(name, pass, detail = '') {
  CHECKS.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

function getState(page) {
  return page.evaluate(() => window.__skyreef.state);
}

function parseTelemetry(text) {
  const throttle = /THR (\d+)%/.exec(text);
  const altitude = /ALT (\d+) FT/.exec(text);
  const speed = /SPD (\d+) KT/.exec(text);
  return {
    throttle: throttle ? Number(throttle[1]) : null,
    altitude: altitude ? Number(altitude[1]) : null,
    speed: speed ? Number(speed[1]) : null,
  };
}

const browser = await chromium.launch({
  headless: true,
  executablePath: '/home/kozak/.local/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? ''}`));
page.on('response', (response) => {
  if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
});
page.on('request', (request) => {
  const url = request.url();
  if (url.startsWith('http://') || url.startsWith('https://')) httpRequests.push(url);
});

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyreef && window.__skyreef.ready === true, { timeout: 30000 });
  await page.waitForTimeout(400);

  const titleVisible = await page.locator('#title.active').count();
  check('title screen is shown on load', titleVisible === 1);
  const controlsText = await page.locator('#title').innerText();
  check(
    'title lists throttle, pitch, roll, yaw, brake and pause',
    ['throttle', 'pitch', 'roll', 'yaw', 'airbrake', 'pause'].every((word) => controlsText.toLowerCase().includes(word)),
  );

  const canvasStats = await page.evaluate(() => {
    const source = document.getElementById('world');
    const sample = document.createElement('canvas');
    sample.width = 96;
    sample.height = 60;
    const context2d = sample.getContext('2d');
    context2d.drawImage(source, 0, 0, 96, 60);
    const data = context2d.getImageData(0, 0, 96, 60).data;
    const colors = new Set();
    let sum = 0;
    let sumSquares = 0;
    const pixels = 96 * 60;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const value = (r + g + b) / 3;
      sum += value;
      sumSquares += value * value;
      colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
    }
    const mean = sum / pixels;
    const variance = sumSquares / pixels - mean * mean;
    return { unique: colors.size, mean: Math.round(mean), std: Math.round(Math.sqrt(Math.max(0, variance))) };
  });
  check('WebGL canvas renders a non-blank image', canvasStats.unique > 30 && canvasStats.std > 5, JSON.stringify(canvasStats));

  const initialScreenshot = await page.screenshot({ type: 'png' });
  const initialHash = createHash('sha256').update(initialScreenshot).digest('hex').slice(0, 12);
  check('title frame is a substantial render', initialScreenshot.length > 50000, `${initialScreenshot.length} bytes`);

  await page.click('#start-button');
  await page.waitForTimeout(700);
  let state = await getState(page);
  check('start button begins the flight', state.screen === 'play' && !state.paused, JSON.stringify(state));

  let telemetryBefore = await page.evaluate(() => document.getElementById('telemetry').textContent);
  const before = parseTelemetry(telemetryBefore);
  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  await page.keyboard.up('w');
  await page.waitForTimeout(300);
  let telemetryAfter = await page.evaluate(() => document.getElementById('telemetry').textContent);
  const after = parseTelemetry(telemetryAfter);
  check('W raises throttle and the HUD value changes', after.throttle > before.throttle, `${before.throttle}% -> ${after.throttle}%`);
  check('HUD telemetry text changes after a key press', telemetryAfter !== telemetryBefore, telemetryAfter);

  const altitudeBefore = (await getState(page)).altitudeFt;
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(400);
  state = await getState(page);
  check('pitch input changes altitude in the HUD', state.altitudeFt > altitudeBefore, `${altitudeBefore} ft -> ${state.altitudeFt} ft`);

  const headingBeforeRoll = (await getState(page)).heading;
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  await page.waitForTimeout(250);
  state = await getState(page);
  check('D rolls and turns the aircraft', Math.abs(state.bankDeg) > 4 || state.heading !== headingBeforeRoll, `bank ${state.bankDeg}°, heading ${headingBeforeRoll} -> ${state.heading}`);

  const headingBeforeYaw = (await getState(page)).heading;
  await page.keyboard.down('e');
  await page.waitForTimeout(500);
  await page.keyboard.up('e');
  await page.waitForTimeout(250);
  state = await getState(page);
  const headingDelta = Math.abs(((state.heading - headingBeforeYaw + 540) % 360) - 180);
  check('E yaw changes the heading', headingDelta > 2, `${headingBeforeYaw}° -> ${state.heading}°`);

  const timeBeforeBrake = (await getState(page)).timeLeft;
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__skyreef.state.brake === true, { timeout: 3000 }).catch(() => {});
  state = await getState(page);
  check(
    'Space engages the airbrake without resetting the flight',
    state.brake === true && state.ringsPassed === 0 && state.screen === 'play' && state.timeLeft <= timeBeforeBrake,
    `clock ${timeBeforeBrake.toFixed(1)} -> ${state.timeLeft.toFixed(1)}`,
  );
  await page.keyboard.up('Space');
  await page.waitForFunction(() => window.__skyreef.state.brake === false, { timeout: 3000 }).catch(() => {});

  const headingBeforeMouse = (await getState(page)).heading;
  await page.mouse.move(1080, 400);
  await page.waitForTimeout(650);
  state = await getState(page);
  check('mouse steering changes bank/heading', Math.abs(state.bankDeg) > 4 || state.heading !== headingBeforeMouse, `bank ${state.bankDeg}°, heading ${headingBeforeMouse} -> ${state.heading}`);
  await page.mouse.move(640, 400);
  await page.waitForTimeout(300);

  const hudStats = await page.evaluate(() => {
    const source = document.getElementById('hud');
    const sample = document.createElement('canvas');
    sample.width = 96;
    sample.height = 60;
    const context2d = sample.getContext('2d');
    context2d.drawImage(source, 0, 0, 96, 60);
    const data = context2d.getImageData(0, 0, 96, 60).data;
    let lit = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] > 0) lit += 1;
    }
    return lit;
  });
  check('HUD canvas has visible drawn content', hudStats > 200, `${hudStats} painted sample pixels`);

  await page.keyboard.press('p');
  await page.waitForFunction(() => window.__skyreef.state.paused === true, { timeout: 4000 }).catch(() => {});
  state = await getState(page);
  const pauseVisible = await page.locator('#pause.active').count();
  check('P pauses the flight and shows the pause panel', state.paused === true && pauseVisible === 1);
  await page.keyboard.press('p');
  await page.waitForFunction(() => window.__skyreef.state.paused === false && window.__skyreef.state.screen === 'play', { timeout: 4000 }).catch(() => {});
  state = await getState(page);
  check('P resumes the flight', state.paused === false && state.screen === 'play');

  await page.keyboard.press('c');
  await page.waitForFunction(() => window.__skyreef.state.view === 'cockpit', { timeout: 4000 }).catch(() => {});
  state = await getState(page);
  check('C switches to the cockpit view', state.view === 'cockpit');
  await page.keyboard.press('c');
  await page.waitForFunction(() => window.__skyreef.state.view === 'chase', { timeout: 4000 }).catch(() => {});
  state = await getState(page);
  check('C switches back to chase view', state.view === 'chase');

  // Fly the real course, gate by gate, using the debug pose helper and the real crossing rules.
  let gateOk = true;
  for (let gate = 0; gate < 5; gate += 1) {
    await page.evaluate((index) => {
      window.__skyreef.debug.setTimer(120);
      window.__skyreef.debug.placeBeforeRing(index, 150);
    }, gate);
    const passed = await page
      .waitForFunction(
        (index) => {
          const current = window.__skyreef.state;
          return current.ringsPassed === index + 1 || (index === 4 && current.screen === 'end');
        },
        gate,
        { timeout: 8000 },
      )
      .then(() => true)
      .catch(() => false);
    state = await getState(page);
    check(`gate ${gate + 1} crossing registers`, passed && (state.ringsPassed === gate + 1 || gate === 4), `rings ${state.ringsPassed}/5`);
    if (!passed) gateOk = false;
  }
  await page.waitForFunction(() => window.__skyreef.state.screen === 'end' && document.querySelector('#end.active'), { timeout: 5000 }).catch(() => {});
  state = await getState(page);
  const winTitle = await page.locator('#end-title').innerText();
  check('all five gates lead to the win screen', gateOk && state.screen === 'end' && winTitle.toLowerCase().includes('course complete'), winTitle);
  const bestAfterWin = await page.evaluate(() => window.localStorage.getItem('skyreef.best-time'));
  check('winning time is saved locally', bestAfterWin !== null && Number(bestAfterWin) > 0, bestAfterWin ?? 'null');

  await page.click('#restart-button');
  await page.waitForTimeout(500);
  state = await getState(page);
  check('restart resets gates and timer', state.screen === 'play' && state.ringsPassed === 0 && state.timeLeft > 170, JSON.stringify(state));

  await page.evaluate(() => window.__skyreef.debug.setPose({ x: 0, y: 3, z: 0, heading: 0, pitch: 0, roll: 0, speed: 150, throttle: 0.5 }));
  await page.waitForFunction(() => window.__skyreef.state.screen === 'end', { timeout: 5000 }).catch(() => {});
  state = await getState(page);
  const crashTitle = await page.locator('#end-title').innerText();
  check('terrain impact ends in the crash screen', state.screen === 'end' && crashTitle.toLowerCase().includes('reef'), crashTitle);

  await page.click('#restart-button');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__skyreef.debug.setTimer(0.25));
  await page.waitForFunction(() => window.__skyreef.state.screen === 'end', { timeout: 5000 }).catch(() => {});
  state = await getState(page);
  const timeoutTitle = await page.locator('#end-title').innerText();
  check('course clock expiry ends in the timeout screen', state.screen === 'end' && timeoutTitle.toLowerCase().includes('time'), timeoutTitle);

  await page.click('#restart-button');
  await page.waitForTimeout(500);
  await page.keyboard.press('m');
  await page.waitForTimeout(120);
  await page.keyboard.press('m');

  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        function tick(now) {
          frames += 1;
          if (now - start < 2000) requestAnimationFrame(tick);
          else resolve((frames / (now - start)) * 1000);
        }
        requestAnimationFrame(tick);
      }),
  );
  check('render loop is active at 1280x800', fps > 5, `${fps.toFixed(1)} fps (SwiftShader software fallback; hardware uses full quality)`);

  await page.screenshot({ path: '/tmp/opencode/flight_build/tools/verify-live.png' });
  state = await getState(page);
  check('game is back in a playable state after all paths', state.screen === 'play' && state.phase === 'flying', JSON.stringify(state));

  const afterHash = createHash('sha256').update(await page.screenshot({ type: 'png' })).digest('hex').slice(0, 12);
  check('render changes over time', afterHash !== initialHash, `${initialHash} -> ${afterHash}`);

  const nonLocal = httpRequests.filter((url) => {
    const parsed = new URL(url);
    return parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1';
  });
  check('no network request leaves localhost', nonLocal.length === 0, nonLocal.join(', ') || `all ${httpRequests.length} requests local`);
  check('no HTTP failures', failedRequests.length === 0 && badResponses.length === 0, [...failedRequests, ...badResponses].join('; ') || 'none');
  check('no JavaScript console errors', consoleErrors.length === 0 && pageErrors.length === 0, [...consoleErrors, ...pageErrors].join('; ') || 'none');
} catch (error) {
  check('verification run completed without an exception', false, error.stack ?? String(error));
} finally {
  await browser.close();
}

const failed = CHECKS.filter((entry) => !entry.pass);
console.log('');
console.log(`Verification: ${CHECKS.length - failed.length}/${CHECKS.length} checks passed.`);
console.log(`Requests observed: ${httpRequests.length} (${[...new Set(httpRequests.map((url) => new URL(url).hostname))].join(', ')})`);
if (failed.length > 0) {
  console.log('Failed checks:');
  for (const entry of failed) console.log(` - ${entry.name}: ${entry.detail}`);
  process.exitCode = 1;
}

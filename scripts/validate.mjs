import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { serve } from './preview.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dependencyRoot = process.env.SQUEEK_TOOLING_DIR || join(root, 'tooling/node_modules');
const { chromium, webkit } = await import(pathToFileURL(join(dependencyRoot, 'playwright/index.mjs')).href);
const { default: AxeBuilder } = await import(pathToFileURL(join(dependencyRoot, '@axe-core/playwright/dist/index.mjs')).href);
const server = serve();
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const output = join(root, 'docs/validation');
await mkdir(join(output, 'screenshots'), { recursive: true });
const results = [], errors = [], remoteRequests = [];
const key = 'squeekchain.demo.benchmark.v1';
const banner = 'TESTNET SIMULATION: This is an educational demo for SqueekChain. All $SQK metrics are simulated scores and do not deliver real tokens. For official testnet tokens, visit sepolia.squeekchain.com.';
const browser = await chromium.launch({ headless: true, executablePath: process.env.SQUEEK_CHROMIUM || undefined });
async function test(name, fn) {
  try { const detail = await fn(); results.push({ name, passed: true, detail: detail || 'Passed' }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, detail: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}
async function context(options = {}) {
  const ctx = await browser.newContext(options);
  ctx.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    page.on('request', request => { if (!request.url().startsWith(url) && /^https?:/.test(request.url())) remoteRequests.push(request.url()); });
  });
  return ctx;
}
let mainContext;
try {
  await test('Production export matches source and includes the local share image', async () => {
    const files = ['index.html', 'styles.css', 'app.js', 'wallet.js'];
    async function assets(dir) {
      for (const item of await readdir(join(root, dir), { withFileTypes: true })) {
        const path = join(dir, item.name);
        if (item.isDirectory()) await assets(path); else files.push(path);
      }
    }
    await assets('assets');
    let bytes = 0;
    for (const file of files) {
      const source = await readFile(join(root, file));
      const exported = await readFile(join(root, 'dist', file));
      assert(source.equals(exported), `Stale export: ${file}`);
      bytes += exported.length;
    }
    const png = await readFile(join(root, 'dist/assets/social-card.png'));
    assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
    assert.equal((await fetch(`${url}assets/social-card.png`)).status, 200);
    return { files: files.length, bytes, shareImage: '1200 × 630 PNG' };
  });

  await test('Responsive export, exact notices, first-screen controls and local assets', async () => {
    const ctx = await context();
    const page = await ctx.newPage();
    const measured = [];
    for (const [width, height] of [[320, 780], [390, 844], [768, 1024], [1440, 1000]]) {
      await page.setViewportSize({ width, height });
      await page.goto(url); await page.evaluate(() => document.fonts.ready);
      assert.equal((await page.locator('.testnet-disclaimer-banner').innerText()).replace(/\s+/g, ' ').trim(), banner);
      assert.equal(await page.locator('#demo-notice').innerText(), 'Client-side simulation only. No cryptocurrency is transferred.');
      assert.equal(await page.locator('#record-score-btn').innerText(), 'Record Simulation Score (Demo)');
      assert.equal(await page.locator('#record-score-btn').isDisabled(), true);
      const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, spin: document.getElementById('run-btn').getBoundingClientRect().toJSON(), record: document.getElementById('record-score-btn').getBoundingClientRect().toJSON(), canvas: document.getElementById('wheel-canvas').getBoundingClientRect().toJSON() }));
      if (width === 390 || width === 1440) await page.screenshot({ path: join(output, `screenshots/${width === 390 ? 'mobile-390' : 'desktop-1440'}.png`), fullPage: width === 1440 });
      const offenders = await page.evaluate(() => [...document.body.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 8).map(el => ({tag:el.tagName, cls:el.className, text:el.textContent.slice(0,60), right:el.getBoundingClientRect().right})));
      assert(layout.scroll <= layout.width, `${width}: horizontal overflow ${JSON.stringify(offenders)}`);
      if (width === 390) {
        assert(layout.spin.bottom <= height, 'Spin button below mobile fold');
        assert(layout.record.bottom <= height, 'Record button below mobile fold');
        assert(layout.canvas.bottom <= height, 'Product below mobile fold');
      }
      measured.push({ width, height, spinBottom: layout.spin.bottom, recordBottom: layout.record.bottom, overflow: layout.scroll - layout.width });
    }
    assert(await page.locator('link[rel="icon"]').getAttribute('href'));
    assert(await page.locator('meta[name="description"]').getAttribute('content'));
    assert(await page.locator('meta[property="og:title"]').getAttribute('content'));
    assert(await page.locator('meta[property="og:image"]').getAttribute('content'));
    assert(await page.evaluate(() => document.fonts.check('16px "Space Grotesk"')));
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    assert.equal(axe.violations.length, 0, JSON.stringify(axe.violations.map(x => ({ id: x.id, targets: x.nodes.map(n => n.target) }))));
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    assert.equal(mobileAxe.violations.length, 0, JSON.stringify(mobileAxe.violations.map(x => x.id)));
    await ctx.close(); return { measured, axeViolations: 0, loadedFonts: true };
  });

  mainContext = await context({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await mainContext.newPage();
  await page.clock.install(); await page.goto(url);
  await test('Guest spin, turbo, scoring, all missions, pause, record and reload', async () => {
    await page.getByRole('button', { name: 'Spin wheel', exact: true }).click();
    await page.clock.runFor(1000);
    assert(Number(await page.locator('#m-sqk').textContent()) > 0);
    assert.equal(await page.locator('#record-score-btn').isEnabled(), true);
    await page.locator('#turbo-toggle-btn').click();
    await page.clock.runFor(54000);
    assert.equal(await page.locator('#turbo-toggle-btn').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#completed-missions').textContent(), '3');
    assert.equal(await page.locator('#user-aura').textContent(), '450');
    assert(Number(await page.locator('#m-blocks').textContent()) >= 4);
    await page.locator('#turbo-toggle-btn').click();
    assert.equal(await page.locator('#display-rpm').textContent(), '0');
    const points = Number(await page.locator('#m-sqk').textContent());
    await page.clock.runFor(2000);
    assert.equal(Number(await page.locator('#m-sqk').textContent()), points, 'Pause must stop progress');
    await page.locator('#record-score-btn').click();
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.equal(stored.points, points);
    assert.deepEqual(Object.keys(stored), ['version', 'points', 'revolutions', 'peakRpm', 'simulatedBlocks', 'recordedAt']);
    assert.match(await page.locator('#record-status').textContent(), /on this browser only/);
    assert.equal(await page.locator('#record-score-btn').isDisabled(), true);
    await page.locator('#reset-session-btn').click();
    assert.equal(await page.locator('#m-sqk').textContent(), '0.00');
    assert.equal(await page.locator('#user-aura').textContent(), '0');
    assert.equal(await page.locator('#completed-missions').textContent(), '0');
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).points, key), points);
    await page.reload();
    assert.match(await page.locator('#record-status').textContent(), /Demo score:/);
    assert.equal(await page.locator('#m-sqk').textContent(), '0.00');
    return { storedRecord: stored, walletRequired: false };
  });

  await test('Keyboard, sound opt-in, event log, details and anchor navigation', async () => {
    assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
    await page.locator('#sound-toggle').click();
    assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
    await page.locator('#sound-toggle').click();
    assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
    await page.locator('#run-btn').focus();
    await page.keyboard.press('Enter'); await page.clock.runFor(500);
    assert(Number(await page.locator('#m-sqk').textContent()) > 0);
    await page.screenshot({ path: join(output, 'screenshots/keyboard-focus.png') });
    await page.locator('#terminal-clear').click();
    assert.match(await page.locator('#terminal-logs').textContent(), /Demo log cleared/);
    await page.getByText('How the benchmark works', { exact: true }).click();
    assert.equal(await page.locator('details').getAttribute('open'), '');
    await page.locator('.session-actions a').click();
    assert.equal(new URL(page.url()).hash, '#genesis-hub');
    assert.match(await page.locator('#share-demo-link').getAttribute('href'), /^https:\/\/twitter.com\/intent\/tweet/);
  });

  await test('No-provider spectator state, modal focus trap, Escape and focus return', async () => {
    await page.locator('#connect-wallet-btn').click();
    await page.clock.runFor(100);
    assert.match(await page.locator('#wallet-options').textContent(), /No browser wallet detected/);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      assert(await page.evaluate(() => !!document.activeElement?.closest('#wallet-dialog')), 'Focus escaped modal');
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#wallet-dialog').isVisible(), false);
    assert.equal(await page.locator('#connect-wallet-btn').evaluate(el => el === document.activeElement), true);
    await page.locator('#connect-wallet-btn').click();
    await page.screenshot({ path: join(output, 'screenshots/spectator-390.png') });
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    assert.equal(axe.violations.length, 0, JSON.stringify(axe.violations.map(x => x.id)));
    await page.locator('#wallet-close').click();
  });

  await test('Reduced motion keeps the wheel static while calculations remain usable', async () => {
    await page.locator('#reset-session-btn').click();
    const before = await page.locator('canvas').evaluate(el => el.toDataURL());
    await page.locator('#turbo-toggle-btn').click(); await page.clock.runFor(5000);
    const after = await page.locator('canvas').evaluate(el => el.toDataURL());
    assert.equal(before, after);
    assert(Number(await page.locator('#m-sqk').textContent()) > 0);
    assert.equal(await page.evaluate(() => document.getAnimations().filter(x => x.playState === 'running').length), 0);
    await page.locator('#turbo-toggle-btn').click();
  });

  for (const mode of ['blocked', 'corrupt']) await test(`Browser storage ${mode}: recovery without wallet or transfer claims`, async () => {
    const ctx = await context({ reducedMotion: 'reduce' });
    await ctx.addInitScript(({ mode, key }) => {
      if (mode === 'blocked') Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
      else if (location.protocol === 'http:') localStorage.setItem(key, '{invalid');
    }, { mode, key });
    const p = await ctx.newPage(); await p.clock.install(); await p.goto(url);
    await p.locator('#run-btn').click(); await p.clock.runFor(1000);
    await p.locator('#record-score-btn').click();
    assert.match(await p.locator('#record-status').textContent(), mode === 'blocked' ? /in this tab only.*Storage is unavailable/ : /on this browser only/);
    await ctx.close();
  });

  await test('EIP-6963 and legacy spectators: allowed RPC only, rejection, pending, changes and disconnect', async () => {
    const ctx = await context({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
    const address = `0x${randomBytes(20).toString('hex')}`;
    await ctx.addInitScript(address => {
      window.__walletTest = { mode: 'success', calls: [], listeners: {}, address };
      const provider = {
        request: async ({ method }) => {
          window.__walletTest.calls.push(method);
          if (method !== 'eth_requestAccounts') throw new Error(`Disallowed ${method}`);
          if (window.__walletTest.mode === 'reject') throw Object.assign(new Error('Declined'), { code: 4001 });
          if (window.__walletTest.mode === 'error') throw new Error('Unavailable');
          if (window.__walletTest.mode === 'empty') return [];
          if (window.__walletTest.mode === 'pending') return new Promise(resolve => { window.__walletTest.resolve = resolve; });
          return [address];
        },
        on: (event, callback) => { window.__walletTest.listeners[event] = callback; },
        removeListener: event => { delete window.__walletTest.listeners[event]; }
      };
      window.ethereum = provider;
      addEventListener('eip6963:requestProvider', () => {
        for (const name of ['Test Browser A', 'Test Browser B']) dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { uuid: name, name }, provider } }));
      });
    }, address);
    const p = await ctx.newPage(); await p.goto(url);
    await p.locator('#connect-wallet-btn').click();
    assert.equal(await p.locator('#wallet-options button').count(), 2);
    assert.equal(await p.getByRole('button', { name: 'Browser wallet', exact: true }).count(), 0);
    for (const mode of ['reject', 'error', 'empty']) {
      await p.evaluate(mode => { window.__walletTest.mode = mode; }, mode);
      await p.getByRole('button', { name: 'Test Browser A', exact: true }).click();
      await p.waitForFunction(() => /declined|Unable/.test(document.getElementById('wallet-status').textContent));
      assert.equal(await p.getByRole('button', { name: 'Test Browser A', exact: true }).isEnabled(), true);
      assert.equal(await p.locator('#wallet-dialog').isVisible(), true);
    }
    await p.evaluate(() => { window.__walletTest.mode = 'pending'; });
    await p.getByRole('button', { name: 'Test Browser A', exact: true }).click();
    assert.equal(await p.locator('#wallet-options button:disabled').count(), 2);
    await p.locator('#wallet-close').click();
    await p.evaluate(() => window.__walletTest.resolve([window.__walletTest.address]));
    assert.equal(await p.locator('.wallet-text').textContent(), 'Connect wallet', 'Late response must not connect');
    await p.evaluate(() => { window.__walletTest.mode = 'success'; });
    await p.locator('#connect-wallet-btn').click();
    await p.getByRole('button', { name: 'Test Browser B', exact: true }).click();
    await p.waitForFunction(() => !document.getElementById('wallet-dialog').open);
    assert.match(await p.locator('.wallet-text').textContent(), /Spectator/);
    assert.equal(await p.locator('#m-sqk').textContent(), '0.00');
    await p.locator('#connect-wallet-btn').click();
    assert.match(await p.locator('#wallet-current').textContent(), new RegExp(address));
    await p.locator('#wallet-disconnect').click();
    assert.equal(await p.locator('.wallet-text').textContent(), 'Connect wallet');
    await p.getByRole('button', { name: 'Test Browser A', exact: true }).click();
    await p.waitForFunction(() => !document.getElementById('wallet-dialog').open);
    await p.evaluate(() => window.__walletTest.listeners.accountsChanged([]));
    assert.equal(await p.locator('.wallet-text').textContent(), 'Connect wallet');
    const calls = await p.evaluate(() => window.__walletTest.calls);
    assert(calls.length >= 6);
    assert(calls.every(method => method === 'eth_requestAccounts'), JSON.stringify(calls));
    assert.equal(await p.evaluate(key => localStorage.getItem(key), key), null);
    await ctx.close(); return { rpcMethods: [...new Set(calls)], requests: calls.length, scoreIndependent: true };
  });

  await test('Legacy browser fallback and mobile wallet app links', async () => {
    const ctx = await context({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage(); await p.goto(url); await p.locator('#connect-wallet-btn').click();
    const links = await p.locator('#wallet-options a').evaluateAll(els => els.map(el => ({ label: el.textContent, href: el.href })));
    assert.equal(links.length, 3);
    assert(links.every(link => /preview/.test(decodeURIComponent(link.href))));
    await p.locator('#wallet-close').click();
    await p.evaluate(() => { window.ethereum = { request: async () => [] }; });
    await p.locator('#connect-wallet-btn').click();
    assert.equal(await p.getByRole('button', { name: 'Browser wallet', exact: true }).count(), 1);
    await ctx.close(); return { appLinks: links.map(link => link.label), legacy: 'Browser wallet' };
  });

  await test('Text enlargement and RTL reflow at 390', async () => {
    const ctx = await context({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage(); await p.goto(url);
    await p.addStyleTag({ content: 'html {font-size:200%}' });
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), '200% text enlargement overflow');
    await p.evaluate(() => { document.documentElement.style.fontSize = '16px'; document.documentElement.dir = 'rtl'; });
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'RTL overflow');
    await ctx.close(); return 'Text enlargement and structural RTL only; not native browser zoom or translated copy.';
  });

  if (process.env.SQUEEK_WEBKIT === '1') await test('WebKit primary spin and record interaction', async () => {
    const safari = await webkit.launch({ headless: true });
    try {
      const ctx = await safari.newContext({ viewport: { width: 390, height: 844 } });
      const p = await ctx.newPage(); await p.goto(url); await p.locator('#run-btn').click();
      await p.waitForFunction(() => Number(document.getElementById('m-sqk').textContent) > 0);
      await p.locator('#record-score-btn').click();
      assert.match(await p.locator('#record-status').textContent(), /on this browser only/);
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= 390));
      await p.screenshot({ path: join(output, 'screenshots/webkit-390.png') });
      await ctx.close();
    } finally { await safari.close(); }
  });
  await test('Runtime health and offline service behavior', async () => {
    assert.deepEqual(errors, []); assert.deepEqual(remoteRequests, []);
    const ctx = await context();
    await ctx.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
    const p = await ctx.newPage(); await p.goto(url); await p.locator('#run-btn').click();
    await p.waitForFunction(() => Number(document.getElementById('m-sqk').textContent) > 0);
    await p.locator('#record-score-btn').click();
    assert.match(await p.locator('#record-status').textContent(), /Demo score/);
    await ctx.close(); return { scriptErrors: errors.length, externalServiceRequests: remoteRequests.length, subpath: '/preview/' };
  });
} finally {
  await mainContext?.close(); await browser.close(); await new Promise(done => server.close(done));
  await writeFile(join(output, 'interaction-results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).length, results, limitations: ['Automated tests use wallet provider fixtures, not real wallet extensions or mobile apps.', 'No physical device, screen reader, or native 200% browser zoom tested.', ...(process.env.SQUEEK_WEBKIT === '1' ? [] : ['WebKit was not run in this invocation.'])] }, null, 2) + '\n');
}
if (results.some(x => !x.passed)) process.exitCode = 1;

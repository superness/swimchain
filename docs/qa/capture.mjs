import { chromium, devices } from 'playwright';
import { mkdirSync } from 'fs';

const ROUND = process.argv[2] || '2026-07-03';
const DIR = `docs/qa/rounds/${ROUND}/shots`;
mkdirSync(DIR, { recursive: true });

const TOKEN = Buffer.from(JSON.stringify({
  v: 1, offer_id: 'demo0000000000000000000000000000', sponsor: 'ab'.repeat(32), net: 'testnet',
})).toString('base64url');

const pages = [
  ['landing', 'https://swimchain.io/'],
  ['developers', 'https://swimchain.io/developers.html'],
  ['invite', `https://swimchain.io/i/#${TOKEN}`],
];

const results = [];
const browser = await chromium.launch();

for (const [device, ctxOpts] of [
  ['desktop', { viewport: { width: 1366, height: 900 } }],
  ['phone', devices['iPhone 13'] ],
]) {
  const ctx = await browser.newContext(ctxOpts);
  for (const [name, url] of pages) {
    const page = await ctx.newPage();
    const t0 = Date.now();
    let status = 0;
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      status = resp ? resp.status() : 0;
    } catch (e) { status = `ERR:${e.message.slice(0, 40)}`; }
    const loadMs = Date.now() - t0;
    const shot = `${DIR}/${name}-${device}.png`;
    await page.screenshot({ path: shot, fullPage: device === 'desktop' });
    const title = await page.title().catch(() => '');
    results.push({ name, device, status, loadMs, title });
    console.log(`${device}/${name}: ${status} ${loadMs}ms "${title}" -> ${shot}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log('\nSUMMARY:', JSON.stringify(results));

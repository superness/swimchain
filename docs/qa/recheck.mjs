import { chromium, devices } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext(devices['iPhone 13']);
for (const [n,u] of [['landing-phone-v2','https://swimchain.io/'],['invite-phone-v2',`https://swimchain.io/i/#${Buffer.from(JSON.stringify({v:1,offer_id:'demo0000000000000000000000000000',sponsor:'ab'.repeat(32),net:'testnet'})).toString('base64url')}`]]) {
  const p = await ctx.newPage(); await p.goto(u,{waitUntil:'networkidle',timeout:20000});
  await p.screenshot({path:`../qa/rounds/2026-07-03/shots/${n}.png`});
  console.log(n, 'ok'); await p.close();
}
await b.close();

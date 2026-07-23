// Drive the Tauri desktop launcher over WebView2 CDP (no focus stealing).
// Usage: node drive-launcher.mjs <cmd> [args...]
//   shot <out.png>          screenshot the page
//   ui                      dump visible text + inputs/buttons
//   type <selector> <text>  fill an input
//   click <selector>        click
//   eval <js>               evaluate and print JSON
import { chromium } from 'playwright';

const [cmd, ...args] = process.argv.slice(2);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9334');
const contexts = browser.contexts();
let page = null;
for (const ctx of contexts) {
  for (const p of ctx.pages()) {
    page = p; // Tauri has one window
  }
}
if (!page) {
  console.error('no page found');
  process.exit(1);
}

if (cmd === 'shot') {
  await page.screenshot({ path: args[0] });
  console.log(args[0]);
} else if (cmd === 'ui') {
  const snap = await page.evaluate(() => {
    const parts = [];
    parts.push('URL: ' + location.href);
    parts.push('TITLE: ' + document.title);
    for (const el of document.querySelectorAll('button, input, select, a, h1, h2, h3, [role=button]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const label = el.tagName === 'INPUT'
        ? `INPUT[type=${el.type}] placeholder="${el.placeholder}"`
        : `${el.tagName} "${(el.textContent || '').trim().slice(0, 60)}"`;
      parts.push(`${label} @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return parts.join('\n');
  });
  console.log(snap);
} else if (cmd === 'type') {
  await page.fill(args[0], args.slice(1).join(' '));
  console.log('typed');
} else if (cmd === 'click') {
  await page.click(args[0], { timeout: 10000 });
  console.log('clicked');
} else if (cmd === 'press') {
  await page.keyboard.press(args[0]);
  console.log('pressed');
} else if (cmd === 'eval') {
  const result = await page.evaluate(args.join(' '));
  console.log(JSON.stringify(result, null, 1));
}
await browser.close();

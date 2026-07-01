#!/usr/bin/env node
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const outDir = path.join(__dirname, '..', 'docs', 'clients', 'private-spaces');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  // forum-client
  { url: 'http://localhost:5173/', output: 'forum-home.png' },
  { url: 'http://localhost:5173/private-spaces', output: 'forum-private-spaces.png' },
  { url: 'http://localhost:5173/create-private-space', output: 'forum-create-private.png' },
  // search-client
  { url: 'http://localhost:5174/', output: 'search-home.png' },
  // chat-client
  { url: 'http://localhost:5175/', output: 'chat-home.png' },
  { url: 'http://localhost:5175/create-private-channel', output: 'chat-create-private.png' },
  // bridge-client
  { url: 'http://localhost:5176/', output: 'bridge-home.png' },
  { url: 'http://localhost:5176/settings', output: 'bridge-settings.png' },
  // archiver-client
  { url: 'http://localhost:5177/', output: 'archiver-home.png' },
  // analytics-client
  { url: 'http://localhost:5178/', output: 'analytics-home.png' },
  // feed-client
  { url: 'http://localhost:5179/', output: 'feed-home.png' },
  { url: 'http://localhost:5179/discover', output: 'feed-discover.png' },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (const t of targets) {
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.goto(t.url, { waitUntil: 'networkidle2', timeout: 15000 });
      await new Promise(r => setTimeout(r, 1500)); // let React render
      const outPath = path.join(outDir, t.output);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`OK: ${t.output}`);
      await page.close();
    } catch (err) {
      console.log(`FAIL: ${t.output} - ${err.message}`);
    }
  }

  await browser.close();
  console.log('Done');
})();

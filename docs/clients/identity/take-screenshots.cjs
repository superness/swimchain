#!/usr/bin/env node
/**
 * Take identity screenshots for all 7 swimchain clients.
 * Uses puppeteer from forum-client/node_modules.
 */
const puppeteer = require('/mnt/c/github/swimchain/forum-client/node_modules/puppeteer');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname);

const clients = [
  { name: 'forum-client', port: 5173 },
  { name: 'search-client', port: 5174 },
  { name: 'chat-client', port: 5175 },
  { name: 'bridge-client', port: 5176 },
  { name: 'archiver-client', port: 5177 },
  { name: 'analytics-client', port: 5178 },
  { name: 'feed-client', port: 5179 },
];

async function takeScreenshot(page, url, outputPath, label) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    // Wait longer for WASM modules and React to fully render
    await new Promise(r => setTimeout(r, 6000));
    await page.screenshot({ path: outputPath, fullPage: true });
    console.log(`OK: ${label} -> ${path.basename(outputPath)}`);
  } catch (err) {
    console.log(`FAIL: ${label} -> ${err.message.split('\n')[0]}`);
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (const client of clients) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Identity page
    const identityUrl = `http://localhost:${client.port}/identity`;
    const identityOut = path.join(OUTPUT_DIR, `${client.name}-identity.png`);
    await takeScreenshot(page, identityUrl, identityOut, `${client.name} /identity`);

    // Main page
    const mainUrl = `http://localhost:${client.port}`;
    const mainOut = path.join(OUTPUT_DIR, `${client.name}-main.png`);
    await takeScreenshot(page, mainUrl, mainOut, `${client.name} /`);

    await page.close();
  }

  await browser.close();
  console.log('\nDone. Screenshots in:', OUTPUT_DIR);
})();

/**
 * Two-Node Sponsorship E2E Test v2
 *
 * Fixed version that properly waits for node identity to load
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'docs/features/sponsorship-e2e');
const GENESIS_URL = 'http://localhost:5173';
const ALPHA_URL = 'http://localhost:5174';

async function screenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`  Screenshot: ${name}.png`);
  return filepath;
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function findButtonByText(page, text) {
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const btnText = await btn.evaluate(el => el.textContent);
    if (btnText && btnText.includes(text)) {
      return btn;
    }
  }
  return null;
}

async function waitForIdentity(page, name, timeout = 30000) {
  console.log(`  Waiting for ${name} identity to load...`);
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const identity = await page.evaluate(() => {
      // Check for identity in the header
      const addressEl = document.querySelector('[class*="address"], .identity-address, code');
      if (addressEl && addressEl.textContent && addressEl.textContent.startsWith('cs1q')) {
        return addressEl.textContent.trim();
      }

      // Also check if Identity Management page shows an address
      const identityCard = document.querySelector('.identity-card, [class*="identity"]');
      if (identityCard) {
        const addr = identityCard.textContent?.match(/cs1q[a-z0-9]{10,}/)?.[0];
        if (addr) return addr;
      }

      return null;
    });

    if (identity) {
      console.log(`  ${name} identity loaded: ${identity.substring(0, 20)}...`);
      return identity;
    }

    await wait(500);
  }

  console.log(`  WARNING: ${name} identity not found after ${timeout}ms`);
  return null;
}

(async () => {
  console.log('='.repeat(60));
  console.log('TWO-NODE SPONSORSHIP E2E TEST v2');
  console.log('='.repeat(60));

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const genesisContext = await browser.createBrowserContext();
  const alphaContext = await browser.createBrowserContext();
  const genesisPage = await genesisContext.newPage();
  const alphaPage = await alphaContext.newPage();

  await genesisPage.setViewport({ width: 1280, height: 900 });
  await alphaPage.setViewport({ width: 1280, height: 900 });

  // Capture console errors
  const errors = { genesis: [], alpha: [] };
  genesisPage.on('console', msg => {
    if (msg.type() === 'error') {
      errors.genesis.push(msg.text());
    }
  });
  alphaPage.on('console', msg => {
    if (msg.type() === 'error') {
      errors.alpha.push(msg.text());
    }
  });

  try {
    // ==========================================
    // STEP 1: Load both identity pages
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 1: Load identity pages');
    console.log('='.repeat(60));

    // Load Genesis
    console.log('\n  Loading Genesis...');
    await genesisPage.goto(`${GENESIS_URL}/identity`, { waitUntil: 'networkidle0', timeout: 30000 });
    await wait(3000);

    // Load Alpha
    console.log('  Loading Alpha...');
    await alphaPage.goto(`${ALPHA_URL}/identity`, { waitUntil: 'networkidle0', timeout: 30000 });
    await wait(3000);

    // Wait for identities
    const genesisAddr = await waitForIdentity(genesisPage, 'Genesis', 15000);
    const alphaAddr = await waitForIdentity(alphaPage, 'Alpha', 15000);

    await screenshot(genesisPage, 'v2-01-genesis-identity');
    await screenshot(alphaPage, 'v2-02-alpha-identity');

    if (!genesisAddr) {
      throw new Error('Genesis identity not loaded');
    }

    // ==========================================
    // STEP 2: Check Alpha's sponsorship status
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 2: Check Alpha sponsorship status');
    console.log('='.repeat(60));

    await alphaPage.goto(`${ALPHA_URL}/sponsorship`, { waitUntil: 'networkidle0', timeout: 30000 });
    await wait(3000);

    // Check if sponsored
    const alphaIsSponsored = await alphaPage.evaluate(() => {
      const text = document.body.innerText;
      return !text.includes('Your identity is not sponsored') &&
             !text.includes('Not Sponsored') &&
             !text.includes('need a sponsor');
    });

    console.log(`  Alpha is sponsored: ${alphaIsSponsored}`);
    await screenshot(alphaPage, 'v2-03-alpha-sponsorship-status');

    // ==========================================
    // STEP 3: Genesis creates offer
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 3: Genesis creates sponsorship offer');
    console.log('='.repeat(60));

    await genesisPage.goto(`${GENESIS_URL}/sponsorship`, { waitUntil: 'networkidle0', timeout: 30000 });
    await wait(3000);

    // Click Sponsor Others tab
    const sponsorTab = await genesisPage.evaluate(() => {
      const tabs = document.querySelectorAll('.sponsorship-tab, [role="tab"], button');
      for (const tab of tabs) {
        if (tab.textContent && tab.textContent.includes('Sponsor Others')) {
          tab.click();
          return true;
        }
      }
      return false;
    });
    console.log(`  Clicked Sponsor Others tab: ${sponsorTab}`);
    await wait(2000);

    await screenshot(genesisPage, 'v2-04-genesis-sponsor-others');

    // Click Create Offer
    const createBtn = await findButtonByText(genesisPage, 'Create Offer');
    if (createBtn) {
      await createBtn.click();
      console.log('  Clicked Create Offer');
      await wait(2000);

      await screenshot(genesisPage, 'v2-05-genesis-create-modal');

      // Fill form - just use defaults
      const submitBtn = await genesisPage.$('.modal-content button.btn-primary, form button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        console.log('  Submitted offer');
        await wait(5000);
      }

      await screenshot(genesisPage, 'v2-06-genesis-after-create');
    }

    // ==========================================
    // STEP 4: Alpha views offers
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 4: Alpha views available offers');
    console.log('='.repeat(60));

    await alphaPage.goto(`${ALPHA_URL}/sponsorship`, { waitUntil: 'networkidle0', timeout: 30000 });
    await wait(3000);

    // Click Get Sponsored tab
    await alphaPage.evaluate(() => {
      const tabs = document.querySelectorAll('.sponsorship-tab, [role="tab"], button');
      for (const tab of tabs) {
        if (tab.textContent && tab.textContent.includes('Get Sponsored')) {
          tab.click();
          return true;
        }
      }
      return false;
    });
    await wait(2000);

    const offerCount = await alphaPage.evaluate(() => {
      const offers = document.querySelectorAll('.offer-card');
      return offers.length;
    });
    console.log(`  Alpha sees ${offerCount} offers`);

    await screenshot(alphaPage, 'v2-07-alpha-offers');

    // ==========================================
    // STEP 5: Alpha claims offer (if not sponsored)
    // ==========================================
    if (!alphaIsSponsored && offerCount > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('STEP 5: Alpha claims offer');
      console.log('='.repeat(60));

      const claimBtn = await findButtonByText(alphaPage, 'Claim');
      if (claimBtn) {
        await claimBtn.click();
        console.log('  Clicked Claim');
        await wait(2000);

        await screenshot(alphaPage, 'v2-08-alpha-claim-modal');

        // Submit claim
        const submitClaim = await alphaPage.$('.modal-content button.btn-primary');
        if (submitClaim) {
          await submitClaim.click();
          console.log('  Submitted claim');
          await wait(5000);
        }

        await screenshot(alphaPage, 'v2-09-alpha-after-claim');
      }

      // ==========================================
      // STEP 6: Genesis approves claim
      // ==========================================
      console.log('\n' + '='.repeat(60));
      console.log('STEP 6: Genesis approves claim');
      console.log('='.repeat(60));

      await genesisPage.reload({ waitUntil: 'networkidle0' });
      await wait(3000);

      // Go to Sponsor Others
      await genesisPage.evaluate(() => {
        const tabs = document.querySelectorAll('.sponsorship-tab, [role="tab"], button');
        for (const tab of tabs) {
          if (tab.textContent && tab.textContent.includes('Sponsor Others')) {
            tab.click();
            return;
          }
        }
      });
      await wait(2000);

      await screenshot(genesisPage, 'v2-10-genesis-check-claims');

      // Find View Claims button with pending
      const viewClaimsBtn = await findButtonByText(genesisPage, 'View Claims');
      if (viewClaimsBtn) {
        await viewClaimsBtn.click();
        console.log('  Clicked View Claims');
        await wait(2000);

        await screenshot(genesisPage, 'v2-11-genesis-claims-list');

        // Approve
        const approveBtn = await findButtonByText(genesisPage, 'Approve');
        if (approveBtn) {
          await approveBtn.click();
          console.log('  Clicked Approve');
          await wait(8000);

          await screenshot(genesisPage, 'v2-12-genesis-after-approve');
        } else {
          console.log('  No Approve button found');
        }
      }

      // ==========================================
      // STEP 7: Verify Alpha is sponsored
      // ==========================================
      console.log('\n' + '='.repeat(60));
      console.log('STEP 7: Verify Alpha sponsored');
      console.log('='.repeat(60));

      await alphaPage.reload({ waitUntil: 'networkidle0' });
      await wait(3000);

      const finalStatus = await alphaPage.evaluate(() => {
        const text = document.body.innerText;
        if (text.includes('Your identity is not sponsored') || text.includes('Not Sponsored')) {
          return 'NOT_SPONSORED';
        }
        if (text.includes('Sponsored') || text.includes('Your sponsor')) {
          return 'SPONSORED';
        }
        return 'UNKNOWN';
      });

      console.log(`  Final status: ${finalStatus}`);
      await screenshot(alphaPage, 'v2-13-alpha-final');
    } else if (alphaIsSponsored) {
      console.log('\n  SKIP: Alpha is already sponsored');

      // Take final screenshot
      await screenshot(alphaPage, 'v2-13-alpha-already-sponsored');
    } else {
      console.log('\n  SKIP: No offers available');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Genesis identity: ${genesisAddr || 'NOT LOADED'}`);
    console.log(`  Alpha identity: ${alphaAddr || 'NOT LOADED'}`);
    console.log(`  Alpha sponsored: ${alphaIsSponsored}`);
    console.log(`  Genesis errors: ${errors.genesis.length}`);
    console.log(`  Alpha errors: ${errors.alpha.length}`);

    if (errors.genesis.length > 0) {
      console.log('\n  Genesis console errors:');
      errors.genesis.slice(0, 5).forEach(e => console.log(`    - ${e.substring(0, 100)}`));
    }
    if (errors.alpha.length > 0) {
      console.log('\n  Alpha console errors:');
      errors.alpha.slice(0, 5).forEach(e => console.log(`    - ${e.substring(0, 100)}`));
    }

  } catch (err) {
    console.error('\nTEST ERROR:', err.message);
    await screenshot(genesisPage, 'v2-error-genesis').catch(() => {});
    await screenshot(alphaPage, 'v2-error-alpha').catch(() => {});
  } finally {
    await browser.close();
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nScreenshots: ${SCREENSHOT_DIR}`);

})();

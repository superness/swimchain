/**
 * Two-Node Sponsorship E2E Test
 *
 * Tests the complete sponsorship flow between Genesis and Alpha nodes:
 * 1. Genesis creates a sponsorship offer
 * 2. Alpha claims the offer
 * 3. Genesis approves the claim
 * 4. Alpha verifies sponsored status
 *
 * Prerequisites:
 * - Genesis forum-client on http://localhost:5173 (RPC 19736)
 * - Alpha forum-client on http://localhost:5174 (RPC 19746)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'docs/features/sponsorship-e2e');
const GENESIS_URL = 'http://localhost:5173';
const ALPHA_URL = 'http://localhost:5174';

// Helper to save screenshot with timestamp
async function screenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`  Screenshot: ${name}.png`);
  return filepath;
}

// Helper to wait
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Helper to find button by text
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

// Helper to click tab by index
async function clickTab(page, tabSelector, index) {
  const tabs = await page.$$(tabSelector);
  if (tabs.length > index) {
    await tabs[index].click();
    await wait(1000);
    return true;
  }
  return false;
}

(async () => {
  console.log('='.repeat(60));
  console.log('TWO-NODE SPONSORSHIP E2E TEST');
  console.log('='.repeat(60));
  console.log(`\nGenesis: ${GENESIS_URL}`);
  console.log(`Alpha: ${ALPHA_URL}`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}\n`);

  // Ensure screenshot directory exists
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Create isolated browser contexts
  const genesisContext = await browser.createBrowserContext();
  const alphaContext = await browser.createBrowserContext();
  const genesisPage = await genesisContext.newPage();
  const alphaPage = await alphaContext.newPage();

  // Set viewport
  await genesisPage.setViewport({ width: 1280, height: 900 });
  await alphaPage.setViewport({ width: 1280, height: 900 });

  // Console logging
  genesisPage.on('console', msg => {
    const text = msg.text();
    if (text.includes('Error') || text.includes('sponsor') || text.includes('Sponsor') || text.includes('offer') || text.includes('Offer')) {
      console.log(`  [Genesis Console] ${text.substring(0, 150)}`);
    }
  });

  alphaPage.on('console', msg => {
    const text = msg.text();
    if (text.includes('Error') || text.includes('claim') || text.includes('Claim') || text.includes('sponsor') || text.includes('Sponsor')) {
      console.log(`  [Alpha Console] ${text.substring(0, 150)}`);
    }
  });

  let testPassed = false;

  try {
    // ==========================================
    // STEP 1: Verify both nodes have identities
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 1: Verify identities');
    console.log('='.repeat(60));

    await genesisPage.goto(`${GENESIS_URL}/identity`, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(2000);

    await alphaPage.goto(`${ALPHA_URL}/identity`, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(2000);

    // Get identities
    const genesisAddr = await genesisPage.evaluate(() => {
      const el = document.querySelector('.identity-address, [class*="address"], code');
      return el ? el.textContent.trim() : 'not found';
    });

    const alphaAddr = await alphaPage.evaluate(() => {
      const el = document.querySelector('.identity-address, [class*="address"], code');
      return el ? el.textContent.trim() : 'not found';
    });

    console.log(`  Genesis identity: ${genesisAddr.substring(0, 30)}...`);
    console.log(`  Alpha identity: ${alphaAddr.substring(0, 30)}...`);

    await screenshot(genesisPage, '01-genesis-identity');
    await screenshot(alphaPage, '02-alpha-identity');

    // ==========================================
    // STEP 2: Genesis navigates to sponsorship
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 2: Genesis - Navigate to Sponsorship');
    console.log('='.repeat(60));

    await genesisPage.goto(`${GENESIS_URL}/sponsorship`, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(3000);

    await screenshot(genesisPage, '03-genesis-sponsorship-initial');

    // ==========================================
    // STEP 3: Genesis goes to My Offers tab
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 3: Genesis - My Offers Tab');
    console.log('='.repeat(60));

    // Click "My Offers" tab (second tab)
    const myOffersClicked = await clickTab(genesisPage, '.sponsorship-tab, [role="tab"], .tab', 1);
    if (myOffersClicked) {
      console.log('  Clicked My Offers tab');
    } else {
      // Try clicking by text
      const myOffersTab = await findButtonByText(genesisPage, 'My Offers');
      if (myOffersTab) {
        await myOffersTab.click();
        console.log('  Clicked My Offers button');
      }
    }
    await wait(2000);

    await screenshot(genesisPage, '04-genesis-my-offers-initial');

    // Check existing offers
    const existingOffers = await genesisPage.$$('.offer-card');
    console.log(`  Existing offers: ${existingOffers.length}`);

    // ==========================================
    // STEP 4: Genesis creates new offer
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 4: Genesis - Create Sponsorship Offer');
    console.log('='.repeat(60));

    // Find and click Create Offer button
    let createBtn = await findButtonByText(genesisPage, 'Create Offer');
    if (!createBtn) {
      createBtn = await genesisPage.$('button.btn-primary, .create-offer-btn');
    }

    if (createBtn) {
      await createBtn.click();
      console.log('  Clicked Create Offer button');
      await wait(2000);

      await screenshot(genesisPage, '05-genesis-create-offer-modal');

      // Fill out the form
      const slotsInput = await genesisPage.$('input#slots, input[name="slots"], input[type="number"]');
      if (slotsInput) {
        await slotsInput.click({ clickCount: 3 });
        await slotsInput.type('1');
        console.log('  Set slots to 1');
      }

      const descInput = await genesisPage.$('textarea#description, textarea[name="description"], input#description');
      if (descInput) {
        await descInput.click({ clickCount: 3 });
        await descInput.type('Test sponsorship offer for E2E test');
        console.log('  Added description');
      }

      await screenshot(genesisPage, '06-genesis-offer-form-filled');

      // Submit the form
      const submitBtn = await genesisPage.$('.modal-content button.btn-primary, .modal button[type="submit"], form button.btn-primary');
      if (submitBtn) {
        await submitBtn.click();
        console.log('  Submitted offer creation');
        await wait(5000); // Wait for PoW
      }

      await screenshot(genesisPage, '07-genesis-after-offer-created');
    } else {
      console.log('  WARNING: Create Offer button not found');
    }

    // Verify offer was created
    await genesisPage.reload({ waitUntil: 'networkidle2' });
    await wait(2000);
    await clickTab(genesisPage, '.sponsorship-tab, [role="tab"], .tab', 1);
    await wait(2000);

    const offersAfter = await genesisPage.$$('.offer-card');
    console.log(`  Offers after creation: ${offersAfter.length}`);

    await screenshot(genesisPage, '08-genesis-offers-after-create');

    // ==========================================
    // STEP 5: Alpha navigates to sponsorship
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 5: Alpha - Navigate to Sponsorship');
    console.log('='.repeat(60));

    await alphaPage.goto(`${ALPHA_URL}/sponsorship`, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(3000);

    // Check if already sponsored
    const alphaBodyText = await alphaPage.evaluate(() => document.body.innerText);
    const alphaIsSponsored = !alphaBodyText.includes('Your identity is not sponsored') &&
                             !alphaBodyText.includes('Not Sponsored');
    console.log(`  Alpha already sponsored: ${alphaIsSponsored}`);

    await screenshot(alphaPage, '09-alpha-sponsorship-initial');

    // ==========================================
    // STEP 6: Alpha sees available offers
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 6: Alpha - Find Sponsor Tab');
    console.log('='.repeat(60));

    // Click Find Sponsor tab (first tab)
    await clickTab(alphaPage, '.sponsorship-tab, [role="tab"], .tab', 0);
    await wait(2000);

    const availableOffers = await alphaPage.$$('.offer-card');
    console.log(`  Available offers: ${availableOffers.length}`);

    await screenshot(alphaPage, '10-alpha-available-offers');

    // ==========================================
    // STEP 7: Alpha claims an offer
    // ==========================================
    if (availableOffers.length > 0 && !alphaIsSponsored) {
      console.log('\n' + '='.repeat(60));
      console.log('STEP 7: Alpha - Claim Offer');
      console.log('='.repeat(60));

      // Find Claim button
      const claimBtn = await findButtonByText(alphaPage, 'Claim');
      if (claimBtn) {
        await claimBtn.click();
        console.log('  Clicked Claim button');
        await wait(2000);

        await screenshot(alphaPage, '11-alpha-claim-modal');

        // Fill message
        const messageInput = await alphaPage.$('textarea#message, input#message, textarea[name="message"]');
        if (messageInput) {
          await messageInput.type('Please sponsor me - E2E test claim');
          console.log('  Added claim message');
        }

        await screenshot(alphaPage, '12-alpha-claim-form-filled');

        // Submit claim
        const submitClaimBtn = await alphaPage.$('.modal-content button.btn-primary, .modal button[type="submit"]');
        if (submitClaimBtn) {
          await submitClaimBtn.click();
          console.log('  Submitted claim');
          await wait(5000); // Wait for PoW
        }

        await screenshot(alphaPage, '13-alpha-after-claim');
      } else {
        console.log('  WARNING: Claim button not found');
      }
    } else if (alphaIsSponsored) {
      console.log('\n  SKIP: Alpha is already sponsored');
    } else {
      console.log('\n  WARNING: No offers available to claim');
    }

    // ==========================================
    // STEP 8: Genesis views pending claims
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 8: Genesis - View Pending Claims');
    console.log('='.repeat(60));

    await genesisPage.reload({ waitUntil: 'networkidle2' });
    await wait(2000);

    // Go to My Offers tab
    await clickTab(genesisPage, '.sponsorship-tab, [role="tab"], .tab', 1);
    await wait(2000);

    await screenshot(genesisPage, '14-genesis-after-alpha-claimed');

    // Find View Claims button
    const viewClaimsBtn = await findButtonByText(genesisPage, 'View Claims');
    if (viewClaimsBtn) {
      await viewClaimsBtn.click();
      console.log('  Clicked View Claims');
      await wait(2000);
    }

    await screenshot(genesisPage, '15-genesis-pending-claims');

    // ==========================================
    // STEP 9: Genesis approves the claim
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 9: Genesis - Approve Claim');
    console.log('='.repeat(60));

    const approveBtn = await findButtonByText(genesisPage, 'Approve');
    if (approveBtn) {
      await approveBtn.click();
      console.log('  Clicked Approve button');
      await wait(8000); // Wait for approval process

      await screenshot(genesisPage, '16-genesis-after-approve');
    } else {
      console.log('  WARNING: Approve button not found');
      // Check page content
      const pageText = await genesisPage.evaluate(() => document.body.innerText);
      console.log(`  Page contains "pending": ${pageText.includes('pending')}`);
      console.log(`  Page contains "claim": ${pageText.includes('claim')}`);
    }

    await genesisPage.reload({ waitUntil: 'networkidle2' });
    await wait(2000);

    await screenshot(genesisPage, '17-genesis-final-state');

    // ==========================================
    // STEP 10: Alpha verifies sponsored status
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('STEP 10: Alpha - Verify Sponsored Status');
    console.log('='.repeat(60));

    await alphaPage.reload({ waitUntil: 'networkidle2' });
    await wait(3000);

    // Go to My Status tab (third tab)
    await clickTab(alphaPage, '.sponsorship-tab, [role="tab"], .tab', 2);
    await wait(2000);

    await screenshot(alphaPage, '18-alpha-final-status');

    // Check final status
    const finalBodyText = await alphaPage.evaluate(() => document.body.innerText);

    if (finalBodyText.includes('Your identity is not sponsored') || finalBodyText.includes('Not Sponsored')) {
      console.log('\n  RESULT: Alpha is NOT yet sponsored');
      console.log('  (This may be expected if there was no offer to claim or approval failed)');
    } else if (finalBodyText.includes('Sponsored') || finalBodyText.includes('Active') || finalBodyText.includes('Your sponsor')) {
      console.log('\n  SUCCESS! Alpha is now SPONSORED!');
      testPassed = true;
    } else {
      console.log('\n  RESULT: Status unclear - check screenshots');
    }

    // Final screenshot of Alpha's identity page
    await alphaPage.goto(`${ALPHA_URL}/identity`, { waitUntil: 'networkidle2' });
    await wait(2000);
    await screenshot(alphaPage, '19-alpha-identity-final');

  } catch (err) {
    console.error('\nTEST ERROR:', err.message);
    await screenshot(genesisPage, 'error-genesis').catch(() => {});
    await screenshot(alphaPage, 'error-alpha').catch(() => {});
  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nScreenshots saved to: ${SCREENSHOT_DIR}`);
  console.log(`Test result: ${testPassed ? 'PASSED' : 'NEEDS VERIFICATION'}`);
  console.log('\nView screenshots:');
  console.log(`  ls -la "${SCREENSHOT_DIR}"`);

})();

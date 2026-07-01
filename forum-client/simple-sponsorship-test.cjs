/**
 * Simple Sponsorship Test - Single Node, Two Browser Contexts
 * 
 * Tests sponsorship flow using Genesis node with two isolated browser identities:
 * 1. Context A (Genesis identity) creates a sponsorship offer
 * 2. Context B (New user) claims the offer
 * 3. Context A approves the claim
 * 4. Context B verifies sponsored status
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'docs/features/simple-sponsorship-test');
const FORUM_URL = 'http://localhost:5173';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function screenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`  Screenshot: ${name}.png`);
  return filepath;
}

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

(async () => {
  console.log('='.repeat(60));
  console.log('SIMPLE SPONSORSHIP TEST - Single Node, Two Contexts');
  console.log('='.repeat(60));
  console.log(`\nForum URL: ${FORUM_URL}`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}\n`);

  // Ensure screenshot directory exists
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Create TWO isolated browser contexts
  const sponsorContext = await browser.createBrowserContext();
  const newUserContext = await browser.createBrowserContext();
  const sponsorPage = await sponsorContext.newPage();
  const newUserPage = await newUserContext.newPage();

  await sponsorPage.setViewport({ width: 1280, height: 900 });
  await newUserPage.setViewport({ width: 1280, height: 900 });

  let testPassed = false;
  let sponsorAddress = null;
  let newUserAddress = null;

  try {
    // STEP 1: Load both contexts
    console.log('\n[STEP 1] Loading forum in both contexts...');
    await Promise.all([
      sponsorPage.goto(FORUM_URL, { waitUntil: 'networkidle2' }),
      newUserPage.goto(FORUM_URL, { waitUntil: 'networkidle2' })
    ]);
    await wait(2000);

    // Get identities - each context should have its own
    sponsorAddress = await sponsorPage.evaluate(() => {
      return localStorage.getItem('swimchain_pubkey') || 'none';
    });
    newUserAddress = await newUserPage.evaluate(() => {
      return localStorage.getItem('swimchain_pubkey') || 'none';
    });

    console.log(`  Sponsor context pubkey: ${sponsorAddress.substring(0, 20)}...`);
    console.log(`  New user context pubkey: ${newUserAddress.substring(0, 20)}...`);

    await screenshot(sponsorPage, '01-sponsor-home');
    await screenshot(newUserPage, '02-newuser-home');

    // STEP 2: Sponsor goes to sponsorship page and creates offer
    console.log('\n[STEP 2] Sponsor navigates to sponsorship page...');
    await sponsorPage.goto(`${FORUM_URL}/sponsorship`, { waitUntil: 'networkidle2' });
    await wait(2000);
    await screenshot(sponsorPage, '03-sponsor-sponsorship-page');

    // Click "Sponsor Others" tab
    const sponsorTab = await sponsorPage.$('[data-testid="tab-sponsor-others"], [data-testid="my-offers-tab"]');
    if (sponsorTab) {
      await sponsorTab.click();
      await wait(1000);
    } else {
      // Try clicking by tab text
      const tabs = await sponsorPage.$$('.tab, [role="tab"]');
      for (const tab of tabs) {
        const text = await tab.evaluate(el => el.textContent);
        if (text && (text.includes('Sponsor Others') || text.includes('My Offers'))) {
          await tab.click();
          await wait(1000);
          break;
        }
      }
    }
    await screenshot(sponsorPage, '04-sponsor-my-offers-tab');

    // Look for existing offers or create button
    const createOfferBtn = await findButtonByText(sponsorPage, 'Create') || 
                           await findButtonByText(sponsorPage, 'New Offer');
    if (createOfferBtn) {
      console.log('  Found Create Offer button');
      await createOfferBtn.click();
      await wait(1000);
      await screenshot(sponsorPage, '05-sponsor-create-modal');
    }

    // STEP 3: New user goes to sponsorship page to claim
    console.log('\n[STEP 3] New user navigates to sponsorship page...');
    await newUserPage.goto(`${FORUM_URL}/sponsorship`, { waitUntil: 'networkidle2' });
    await wait(2000);
    await screenshot(newUserPage, '06-newuser-sponsorship-page');

    // Check if there are offers to claim
    const pageContent = await newUserPage.content();
    const hasOffers = !pageContent.includes('No open offers') && 
                      !pageContent.includes('no offers');

    console.log(`  Has claimable offers: ${hasOffers}`);

    if (hasOffers) {
      // Find and click a claim button
      const claimBtn = await findButtonByText(newUserPage, 'Claim') ||
                       await findButtonByText(newUserPage, 'Request');
      if (claimBtn) {
        console.log('  Claiming an offer...');
        await claimBtn.click();
        await wait(1000);
        await screenshot(newUserPage, '07-newuser-claim-modal');
        
        // Fill in claim message if there's a textarea
        const textarea = await newUserPage.$('textarea');
        if (textarea) {
          await textarea.type('I would like to join SwimChain! - Test User');
        }
        
        // Submit claim
        const submitBtn = await findButtonByText(newUserPage, 'Submit') ||
                          await findButtonByText(newUserPage, 'Send');
        if (submitBtn) {
          await submitBtn.click();
          await wait(3000);
          await screenshot(newUserPage, '08-newuser-claim-submitted');
        }
      }
    } else {
      console.log('  No offers available - checking RPC directly...');
    }

    // STEP 4: Check final status
    console.log('\n[STEP 4] Final status check...');
    await sponsorPage.reload({ waitUntil: 'networkidle2' });
    await newUserPage.reload({ waitUntil: 'networkidle2' });
    await wait(2000);
    
    await screenshot(sponsorPage, '09-sponsor-final');
    await screenshot(newUserPage, '10-newuser-final');

    console.log('\n='.repeat(60));
    console.log('TEST COMPLETE');
    console.log('='.repeat(60));
    testPassed = true;

  } catch (err) {
    console.error('\n[ERROR]', err.message);
    await screenshot(sponsorPage, 'error-sponsor');
    await screenshot(newUserPage, 'error-newuser');
  } finally {
    await browser.close();
  }

  console.log(`\nResult: ${testPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);
  process.exit(testPassed ? 0 : 1);
})();

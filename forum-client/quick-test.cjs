const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Capture console logs
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[CreateOffer]') || text.includes('Error') || text.includes('Signature') || text.includes('RPC')) {
      console.log(`[CONSOLE] ${text}`);
    }
  });

  try {
    // Go to sponsorship page
    console.log('Navigating to Sponsorship page...');
    await page.goto('http://localhost:5173/sponsorship', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    // Screenshot
    await page.screenshot({ path: '/tmp/test1-sponsorship.png', fullPage: true });
    console.log('Screenshot saved: /tmp/test1-sponsorship.png');

    // Check identity
    const header = await page.$eval('.identity-info, .user-address, [class*="address"]', el => el.textContent).catch(() => 'not found');
    console.log('Identity in header:', header);

    // Click My Offers tab
    console.log('Clicking My Offers tab...');
    await page.waitForSelector('.sponsorship-tab', { timeout: 5000 });
    const tabs = await page.$$('.sponsorship-tab');
    if (tabs.length >= 2) {
      await tabs[1].click();  // My Offers is second tab
    }
    await new Promise(r => setTimeout(r, 2000));

    // Screenshot after clicking tab
    await page.screenshot({ path: '/tmp/test2-my-offers.png', fullPage: true });
    console.log('Screenshot saved: /tmp/test2-my-offers.png');

    // Click Create Offer button
    console.log('Clicking Create Offer button...');
    const createBtn = await page.$('button.btn-primary');
    if (createBtn) {
      await createBtn.click();
    } else {
      console.log('Create Offer button not found');
    }
    await new Promise(r => setTimeout(r, 2000));

    // Screenshot after clicking Create Offer
    await page.screenshot({ path: '/tmp/test3-modal.png', fullPage: true });
    console.log('Screenshot saved: /tmp/test3-modal.png');

    // Fill slots and submit
    console.log('Filling form...');
    const slotsInput = await page.$('input#slots');
    if (slotsInput) {
      await slotsInput.click({ clickCount: 3 });
      await slotsInput.type('3');
      console.log('Filled slots: 3');
    }

    // Screenshot before submit
    await page.screenshot({ path: '/tmp/test4-filled.png', fullPage: true });
    console.log('Screenshot saved: /tmp/test4-filled.png');

    // Find and click the submit button in modal
    console.log('Clicking Submit...');
    const submitBtn = await page.$('.modal-content button.btn-primary');
    if (submitBtn) {
      await submitBtn.click();
      console.log('Clicked submit button');
    } else {
      console.log('Submit button not found in modal');
    }

    // Wait for result
    await new Promise(r => setTimeout(r, 5000));

    // Final screenshot
    await page.screenshot({ path: '/tmp/test5-result.png', fullPage: true });
    console.log('Screenshot saved: /tmp/test5-result.png');

    // Check for errors or success
    const modalContent = await page.$eval('.modal-content', el => el.textContent).catch(() => '');
    const pageContent = await page.evaluate(() => document.body.innerText);

    if (pageContent.includes('Error') || modalContent.includes('Error')) {
      console.log('ERROR found in page');
      if (modalContent) console.log('Modal content:', modalContent.substring(0, 500));
    } else if (pageContent.includes('offer created') || pageContent.includes('Offer created')) {
      console.log('SUCCESS - Offer created!');
    } else {
      console.log('Unknown result - check screenshots');
    }

  } catch (err) {
    console.error('Test error:', err.message);
    await page.screenshot({ path: '/tmp/test-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();

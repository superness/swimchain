const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });

  // Create two separate browser contexts for isolation
  const genesisContext = await browser.createBrowserContext();
  const alphaContext = await browser.createBrowserContext();

  const genesisPage = await genesisContext.newPage();
  const alphaPage = await alphaContext.newPage();

  // Log capture
  genesisPage.on('console', msg => {
    const text = msg.text();
    if (text.includes('[CreateOffer]') || text.includes('Error') || text.includes('[MySponsorshipOffers]') || text.includes('Approve') || text.includes('sponsor') || text.includes('sign') || text.includes('Sign') || text.includes('useSign')) {
      console.log(`[Genesis] ${text}`);
    }
  });

  alphaPage.on('console', msg => {
    const text = msg.text();
    if (text.includes('Claim') || text.includes('Error') || text.includes('[NodeIdentity]') || text.includes('RPC')) {
      console.log(`[Alpha] ${text}`);
    }
  });

  try {
    console.log('\n=== STEP 1: Check both nodes have different identities ===\n');

    // Genesis connects to localhost:5173 (RPC 19736)
    await genesisPage.goto('http://localhost:5173/identity', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    // Alpha connects to localhost:5174 (RPC 19746)
    await alphaPage.goto('http://localhost:5174/identity', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    // Get identities
    const genesisAddr = await genesisPage.evaluate(() => {
      const el = document.querySelector('.identity-address, [class*="address"]');
      return el ? el.textContent : 'not found';
    });
    const alphaAddr = await alphaPage.evaluate(() => {
      const el = document.querySelector('.identity-address, [class*="address"]');
      return el ? el.textContent : 'not found';
    });

    console.log('Genesis identity:', genesisAddr);
    console.log('Alpha identity:', alphaAddr);

    // Screenshots
    await genesisPage.screenshot({ path: '/tmp/flow-1a-genesis-identity.png', fullPage: true });
    await alphaPage.screenshot({ path: '/tmp/flow-1b-alpha-identity.png', fullPage: true });

    console.log('\n=== STEP 2: Genesis creates sponsorship offer ===\n');

    await genesisPage.goto('http://localhost:5173/sponsorship', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    // Click My Offers tab
    const genesisTabs = await genesisPage.$$('.sponsorship-tab');
    if (genesisTabs.length >= 2) {
      await genesisTabs[1].click();
    }
    await new Promise(r => setTimeout(r, 2000));

    // Always create a fresh offer to avoid stale state issues
    console.log('Creating new sponsorship offer...');
    const createBtn = await genesisPage.$('button.btn-primary');
    if (createBtn) {
      await createBtn.click();
      await new Promise(r => setTimeout(r, 2000));

      const slotsInput = await genesisPage.$('input#slots');
      if (slotsInput) {
        await slotsInput.click({ clickCount: 3 });
        await slotsInput.type('5');
      }

      const submitBtn = await genesisPage.$('.modal-content button.btn-primary');
      if (submitBtn) {
        await submitBtn.click();
        console.log('Clicked Create Offer submit button');
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    // Check offers were created
    const existingOffers = await genesisPage.$$('.offer-card');
    console.log(`Genesis now has ${existingOffers.length} offers`)

    await genesisPage.screenshot({ path: '/tmp/flow-2-genesis-my-offers.png', fullPage: true });
    console.log('Screenshot: /tmp/flow-2-genesis-my-offers.png');

    console.log('\n=== STEP 3: Alpha checks if already sponsored ===\n');

    await alphaPage.goto('http://localhost:5174/sponsorship', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    // Check sponsorship status
    const alphaBodyText = await alphaPage.evaluate(() => document.body.innerText);
    const alphaIsSponsored = alphaBodyText.includes('Your identity is not sponsored') === false;
    console.log('Alpha already sponsored?', alphaIsSponsored);

    // Go to Find a Sponsor tab (first tab)
    const alphaTabs = await alphaPage.$$('.sponsorship-tab');
    if (alphaTabs.length >= 1) {
      await alphaTabs[0].click();
    }
    await new Promise(r => setTimeout(r, 2000));

    await alphaPage.screenshot({ path: '/tmp/flow-3-alpha-find-sponsor.png', fullPage: true });

    // Check available offers
    const availableOffers = await alphaPage.$$('.offer-card');
    console.log(`Alpha sees ${availableOffers.length} available offers`);

    if (availableOffers.length > 0 && !alphaIsSponsored) {
      console.log('\n=== STEP 4: Alpha claims the offer ===\n');

      // Find and click the first Claim button
      const buttons = await alphaPage.$$('button');
      let claimed = false;
      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.textContent);
        if (text.includes('Claim This Offer')) {
          console.log('Found "Claim This Offer" button, clicking...');
          await btn.click();
          claimed = true;
          break;
        }
      }

      if (claimed) {
        await new Promise(r => setTimeout(r, 2000));
        await alphaPage.screenshot({ path: '/tmp/flow-4-alpha-claim-modal.png', fullPage: true });

        // Fill message
        const messageInput = await alphaPage.$('textarea#message, input#message');
        if (messageInput) {
          await messageInput.type('I would like to join the Swimchain network.');
        }

        // Submit
        const submitClaimBtn = await alphaPage.$('.modal-content button.btn-primary');
        if (submitClaimBtn) {
          await submitClaimBtn.click();
          console.log('Claim submitted');
          await new Promise(r => setTimeout(r, 5000));
        }

        await alphaPage.screenshot({ path: '/tmp/flow-5-alpha-after-claim.png', fullPage: true });
      }
    }

    console.log('\n=== STEP 5: Genesis approves the claim ===\n');

    await genesisPage.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    // Go to My Offers tab
    const genesisTabs2 = await genesisPage.$$('.sponsorship-tab');
    if (genesisTabs2.length >= 2) {
      await genesisTabs2[1].click();
    }
    await new Promise(r => setTimeout(r, 2000));

    // Find View Claims button with pending count
    let viewClaimsBtn = null;
    for (const btn of await genesisPage.$$('button')) {
      const text = await btn.evaluate(el => el.textContent);
      if (text.includes('View Claims') && text.includes('1')) {
        viewClaimsBtn = btn;
        console.log('Found View Claims button with 1 pending claim');
        break;
      }
    }

    if (viewClaimsBtn) {
      await viewClaimsBtn.click();
      console.log('Clicked View Claims');
      await new Promise(r => setTimeout(r, 3000));
    }

    await genesisPage.screenshot({ path: '/tmp/flow-6-genesis-view-claims.png', fullPage: true });

    // Look for Approve button in the expanded view
    let approved = false;
    for (const btn of await genesisPage.$$('button')) {
      const text = await btn.evaluate(el => el.textContent);
      if (text.includes('Approve')) {
        console.log('Found Approve button, clicking...');
        await btn.click();
        approved = true;
        console.log('Waiting for approval to process...');
        await new Promise(r => setTimeout(r, 8000));  // Wait longer for approval
        break;
      }
    }

    // Take screenshot right after approval attempt
    await genesisPage.screenshot({ path: '/tmp/flow-6b-after-approve-click.png', fullPage: true });
    console.log('Screenshot after approve click: /tmp/flow-6b-after-approve-click.png');

    if (!approved) {
      console.log('No Approve button found - checking page content');
      const pageText = await genesisPage.evaluate(() => document.body.innerText);
      console.log('Page contains "Approve":', pageText.includes('Approve'));
      console.log('Page contains "pending":', pageText.includes('pending'));
    }

    await genesisPage.screenshot({ path: '/tmp/flow-7-genesis-after-approve.png', fullPage: true });

    console.log('\n=== STEP 6: Verify Alpha is now sponsored ===\n');

    await alphaPage.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    // Go to My Status tab
    const alphaTabs2 = await alphaPage.$$('.sponsorship-tab');
    if (alphaTabs2.length >= 3) {
      await alphaTabs2[2].click();
    }
    await new Promise(r => setTimeout(r, 2000));

    await alphaPage.screenshot({ path: '/tmp/flow-8-alpha-final-status.png', fullPage: true });

    // Check final status
    const finalStatus = await alphaPage.evaluate(() => document.body.innerText);
    if (finalStatus.includes('Your identity is not sponsored')) {
      console.log('\n RESULT: Alpha is NOT yet sponsored\n');
    } else if (finalStatus.includes('Sponsored') || finalStatus.includes('Active')) {
      console.log('\n SUCCESS! Alpha is now SPONSORED!\n');
    } else {
      console.log('\n Status unclear - check screenshots\n');
    }

    console.log('\nScreenshots saved to /tmp/flow-*.png');

  } catch (err) {
    console.error('Test error:', err.message);
    await genesisPage.screenshot({ path: '/tmp/flow-error-genesis.png', fullPage: true }).catch(() => {});
    await alphaPage.screenshot({ path: '/tmp/flow-error-alpha.png', fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
})();

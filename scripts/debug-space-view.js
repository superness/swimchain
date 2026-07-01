/**
 * Debug script to analyze why SpaceView isn't calling list_space_content
 * Uses puppeteer to open the forum-client and capture console logs
 */

const puppeteer = require('puppeteer');

async function debug() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Capture all console logs
    const logs = [];
    page.on('console', msg => {
        const text = msg.text();
        logs.push(`[${msg.type()}] ${text}`);
        console.log(`[BROWSER] ${text}`);
    });
    
    // Capture network requests
    const requests = [];
    page.on('request', req => {
        if (req.url().includes('19736')) {
            requests.push({
                url: req.url(),
                method: req.method(),
                postData: req.postData()
            });
        }
    });
    
    try {
        console.log('1. Navigating to forum-client...');
        await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 10000 });
        console.log('2. Page loaded');
        
        // Check what page we're on
        const url = page.url();
        console.log('3. Current URL:', url);
        
        // Wait a bit for any redirects
        await new Promise(r => setTimeout(r, 2000));
        console.log('4. URL after wait:', page.url());
        
        // Check if we got redirected to identity page
        if (page.url().includes('/identity')) {
            console.log('\n[!] Redirected to identity page - no identity in localStorage');
            
            // Set a test identity
            await page.evaluate(() => {
                const identity = {
                    seed: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
                    publicKey: '9b109b5ce57fbff9795d380b6df52275239e16068c7038a7a54ae544d546bca0',
                    address: 'cs1qtest...'
                };
                localStorage.setItem('swimchain-identity', JSON.stringify(identity));
                console.log('[TEST] Set test identity in localStorage');
            });
            
            // Reload
            console.log('5. Reloading with test identity...');
            await page.reload({ waitUntil: 'networkidle0' });
            await new Promise(r => setTimeout(r, 2000));
            console.log('6. URL after reload:', page.url());
        }
        
        // Navigate to the specific space
        const spaceId = 'sp1qruc7h2sm5gyc8levfwquh77wtssku826e';
        console.log(`7. Navigating to space ${spaceId}...`);
        await page.goto(`http://localhost:5173/spaces/${spaceId}`, { waitUntil: 'networkidle0', timeout: 10000 });
        
        await new Promise(r => setTimeout(r, 3000));
        
        console.log('\n=== Console Logs ===');
        logs.forEach(l => console.log(l));
        
        console.log('\n=== RPC Requests ===');
        requests.forEach(r => console.log(JSON.stringify(r, null, 2)));
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await browser.close();
    }
}

debug().catch(console.error);

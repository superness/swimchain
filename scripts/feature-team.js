#!/usr/bin/env node
/**
 * Feature Testing Team Coordinator
 *
 * Orchestrates a team of agents via the Chat API to:
 * 1. Test features from FEATURE_CATALOG.md
 * 2. Document working features with screenshots
 * 3. Report and fix bugs found
 */

const http = require('http');

const PROXY_HOST = 'localhost';
const PROXY_PORT = 8081;

// Team member tab IDs
const TEAM = {
  lead: null,      // Feature-Team lead
  qa: null,        // QA-Tester
  bugfix: null,    // Bug-Fixer
  docs: null       // Screenshot-Doc
};

// Helper to make HTTP requests
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: PROXY_HOST,
      port: PROXY_PORT,
      path,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {}
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Send message to a team member and wait for response
async function askTeamMember(tabId, message, timeoutMs = 120000) {
  const sendResult = await request('POST', '/api/chat/send', { tabId, message });
  const requestId = sendResult.requestId;

  if (!requestId) {
    throw new Error(`Failed to send message: ${JSON.stringify(sendResult)}`);
  }

  console.log(`  Waiting for response (${requestId})...`);
  const response = await request('GET', `/api/chat/response/${requestId}?timeout=${timeoutMs}`);
  return response.response;
}

// Initialize team tabs
async function initTeam() {
  console.log('Initializing feature testing team...\n');

  // Get existing tabs
  const { tabs } = await request('GET', '/api/tabs');

  // Find or create team tabs
  for (const tab of tabs) {
    if (tab.name === 'Feature-Team') TEAM.lead = tab.tabId;
    if (tab.name === 'QA-Tester') TEAM.qa = tab.tabId;
    if (tab.name === 'Bug-Fixer') TEAM.bugfix = tab.tabId;
    if (tab.name === 'Screenshot-Doc') TEAM.docs = tab.tabId;
  }

  // Create missing tabs
  if (!TEAM.lead) {
    const result = await request('POST', '/api/tabs', { name: 'Feature-Team', workingDirectory: '/mnt/c/github/swimchain' });
    TEAM.lead = result.tabId;
  }
  if (!TEAM.qa) {
    const result = await request('POST', '/api/tabs', { name: 'QA-Tester', workingDirectory: '/mnt/c/github/swimchain' });
    TEAM.qa = result.tabId;
  }
  if (!TEAM.bugfix) {
    const result = await request('POST', '/api/tabs', { name: 'Bug-Fixer', workingDirectory: '/mnt/c/github/swimchain' });
    TEAM.bugfix = result.tabId;
  }
  if (!TEAM.docs) {
    const result = await request('POST', '/api/tabs', { name: 'Screenshot-Doc', workingDirectory: '/mnt/c/github/swimchain' });
    TEAM.docs = result.tabId;
  }

  console.log('Team tabs:', TEAM);
  return TEAM;
}

// Test a single feature
async function testFeature(featureName, featureDescription, route) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing Feature: ${featureName}`);
  console.log(`Route: ${route}`);
  console.log('='.repeat(60));

  // Step 1: QA tests the feature
  console.log('\n[QA-Tester] Testing feature...');
  const qaResult = await askTeamMember(TEAM.qa, `
Test the following feature in forum-client (running at http://localhost:5173):

Feature: ${featureName}
Description: ${featureDescription}
Route: ${route}

Use browser-control.js to:
1. node scripts/browser-control.js init
2. node scripts/browser-control.js launch
3. node scripts/browser-control.js navigate "http://localhost:5173${route}"
4. Test the feature's expected behavior
5. Take a screenshot: node scripts/browser-control.js screenshot --output=forum-client/docs/features/test-${featureName.toLowerCase().replace(/\s+/g, '-')}.png

Report:
- PASS if feature works as expected
- FAIL if something is broken (include error details)
- Include the screenshot path

At the end, run: node scripts/browser-control.js close
`, 180000);

  console.log(`\n[QA-Tester Result]:\n${qaResult}`);

  // Handle undefined response
  if (!qaResult) {
    console.log('\n[Warning] QA agent returned no response. Check agent status.');
    return { feature: featureName, hasBug: false, qaResult: 'No response' };
  }

  // Step 2: Check if bug found
  const qaResultLower = qaResult.toLowerCase();
  const hasBug = qaResultLower.includes('fail') ||
                 qaResultLower.includes('bug') ||
                 qaResultLower.includes('broken') ||
                 (qaResultLower.includes('error') && !qaResultLower.includes('error state'));

  if (hasBug) {
    console.log('\n[Bug-Fixer] Bug detected, investigating...');
    const fixResult = await askTeamMember(TEAM.bugfix, `
A bug was found while testing:

Feature: ${featureName}
Route: ${route}

QA Report:
${qaResult}

Please:
1. Investigate the root cause in forum-client/src/
2. Implement a fix if possible
3. Report what you found and any changes made
`, 180000);

    console.log(`\n[Bug-Fixer Result]:\n${fixResult}`);
  } else {
    console.log('\n[Screenshot-Doc] Feature passed, documenting...');
    // Feature passed, document it
    const docResult = await askTeamMember(TEAM.docs, `
Document the following feature that passed QA testing:

Feature: ${featureName}
Description: ${featureDescription}
Route: ${route}

Create documentation at forum-client/docs/features/${featureName.toLowerCase().replace(/\s+/g, '-')}/README.md

Include:
- Feature description
- How to access it
- Any screenshots that were captured
- Key UI elements
`, 120000);

    console.log(`\n[Screenshot-Doc Result]:\n${docResult}`);
  }

  return { feature: featureName, hasBug, qaResult };
}

// Main orchestration
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Feature Testing Team Coordinator

Usage:
  node feature-team.js test <feature-name>    Test a specific feature
  node feature-team.js list                   List all features from catalog
  node feature-team.js all                    Test all features (takes a while)
  node feature-team.js status                 Show team status

Examples:
  node feature-team.js test "Identity Display"
  node feature-team.js test "Sponsorship Status Badge"
`);
    return;
  }

  await initTeam();

  const command = args[0];

  if (command === 'status') {
    console.log('\nTeam Status:');
    console.log('  Lead:', TEAM.lead);
    console.log('  QA:', TEAM.qa);
    console.log('  Bug Fixer:', TEAM.bugfix);
    console.log('  Docs:', TEAM.docs);
    return;
  }

  if (command === 'list') {
    console.log('\nFeatures from FEATURE_CATALOG.md:');
    console.log('\n1. Identity & Onboarding:');
    console.log('   - Identity Generation (/identity)');
    console.log('   - Identity Display (/spaces)');
    console.log('   - Identity Export (/identity)');
    console.log('   - Identity Import (/identity)');
    console.log('   - Identity Badge Copy (/spaces)');

    console.log('\n2. Sponsorship System:');
    console.log('   - Sponsorship Status Badge (/spaces)');
    console.log('   - Get Sponsored Tab (/sponsorship)');
    console.log('   - Sponsor Others Tab (/sponsorship)');
    console.log('   - My Status Tab (/sponsorship)');
    console.log('   - Create Sponsorship Offer (/sponsorship)');
    console.log('   - View Sponsorship Claims (/sponsorship)');
    console.log('   - Approve/Reject Claims (/sponsorship)');
    console.log('   - Claim Sponsorship Offer (/sponsorship)');
    console.log('   - Revoke Sponsorship (/sponsorship)');

    console.log('\n... (see forum-client/docs/FEATURE_CATALOG.md for full list)');
    return;
  }

  if (command === 'test') {
    const featureName = args.slice(1).join(' ');
    if (!featureName) {
      console.error('Please specify a feature name');
      return;
    }

    // Simple feature lookup
    const features = {
      'identity display': { desc: 'Shows truncated identity address in header', route: '/spaces' },
      'identity generation': { desc: 'Generate new keypair on first visit', route: '/identity' },
      'sponsorship status badge': { desc: 'Shows sponsorship status in header', route: '/spaces' },
      'get sponsored tab': { desc: 'Find and claim sponsorship offers', route: '/sponsorship' },
      'sponsor others tab': { desc: 'Create offers to sponsor newcomers', route: '/sponsorship' },
      'my status tab': { desc: 'View sponsorship depth and relationship', route: '/sponsorship' },
      'space list': { desc: 'Browse and follow public spaces', route: '/spaces' },
      'create space': { desc: 'Create a new public space', route: '/spaces' },
      'node status bar': { desc: 'Shows connection status, peer count', route: '/spaces' },
    };

    const key = featureName.toLowerCase();
    if (!features[key]) {
      console.error(`Unknown feature: ${featureName}`);
      console.log('Available features:', Object.keys(features).join(', '));
      return;
    }

    const { desc, route } = features[key];
    await testFeature(featureName, desc, route);
  }
}

main().catch(console.error);

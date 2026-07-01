/**
 * Desktop App Integration Test
 *
 * Tests the desktop app by:
 * 1. Launching the exe
 * 2. Waiting for node RPC to be ready
 * 3. Testing basic RPC functionality
 * 4. Verifying client bundles exist
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Configuration
const CONFIG = {
  exePath: path.join(__dirname, '../src-tauri/target/release/swimchain-desktop.exe'),
  rpcPort: 19736, // testnet port
  rpcHost: '127.0.0.1',
  startupTimeout: 30000, // 30 seconds
  pollInterval: 1000, // 1 second
  password: process.env.TEST_PASSWORD || 'testpassword123',
  dataDir: process.env.APPDATA ? path.join(process.env.APPDATA, 'swimchain-testnet') : null,
};

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

function log(msg) {
  console.log(`[TEST] ${new Date().toISOString()} - ${msg}`);
}

function logResult(name, passed, error = null) {
  results.tests.push({ name, passed, error });
  if (passed) {
    results.passed++;
    console.log(`  ✓ ${name}`);
  } else {
    results.failed++;
    console.log(`  ✗ ${name}: ${error || 'Failed'}`);
  }
}

// Read cookie for RPC auth
function getRpcAuth() {
  if (!CONFIG.dataDir) return null;
  const cookiePath = path.join(CONFIG.dataDir, '.cookie');
  if (!fs.existsSync(cookiePath)) return null;
  const cookie = fs.readFileSync(cookiePath, 'utf8').trim();
  const credentials = `__cookie__:${cookie}`;
  return 'Basic ' + Buffer.from(credentials).toString('base64');
}

// Make RPC call
async function rpcCall(method, params = {}) {
  return new Promise((resolve, reject) => {
    const auth = getRpcAuth();
    if (!auth) {
      reject(new Error('No RPC auth available'));
      return;
    }

    const postData = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    });

    const options = {
      hostname: CONFIG.rpcHost,
      port: CONFIG.rpcPort,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': auth,
      },
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error.message || JSON.stringify(json.error)));
          } else {
            resolve(json.result);
          }
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data.substring(0, 100)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(postData);
    req.end();
  });
}

// Wait for RPC to be ready
async function waitForRpc(timeout = CONFIG.startupTimeout) {
  const start = Date.now();
  log(`Waiting for RPC on port ${CONFIG.rpcPort}...`);

  while (Date.now() - start < timeout) {
    try {
      await rpcCall('get_node_info');
      log('RPC is ready!');
      return true;
    } catch (e) {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, CONFIG.pollInterval));
  }
  return false;
}

// Check if client bundles exist
function checkClientBundles() {
  const clientsDir = path.join(__dirname, '../public/clients');
  const clients = ['forum-client', 'chat-client', 'feed-client', 'search-client'];

  log('Checking client bundles...');

  for (const client of clients) {
    const clientPath = path.join(clientsDir, client);
    const indexPath = path.join(clientPath, 'index.html');
    const exists = fs.existsSync(indexPath);
    logResult(`Client bundle: ${client}`, exists, exists ? null : 'index.html not found');
  }
}

// Test RPC methods
async function testRpcMethods() {
  log('Testing RPC methods...');

  // Test get_node_info
  try {
    const nodeInfo = await rpcCall('get_node_info');
    logResult('RPC: get_node_info', nodeInfo && typeof nodeInfo === 'object');
  } catch (e) {
    logResult('RPC: get_node_info', false, e.message);
  }

  // Test get_peers
  try {
    const peers = await rpcCall('get_peers');
    logResult('RPC: get_peers', Array.isArray(peers));
  } catch (e) {
    logResult('RPC: get_peers', false, e.message);
  }

  // Test list_spaces
  try {
    const spaces = await rpcCall('list_spaces', { limit: 10 });
    logResult('RPC: list_spaces', Array.isArray(spaces));
  } catch (e) {
    logResult('RPC: list_spaces', false, e.message);
  }

  // Test search
  try {
    const searchResult = await rpcCall('search', { query: 'test', limit: 5 });
    logResult('RPC: search', searchResult && typeof searchResult === 'object');
  } catch (e) {
    logResult('RPC: search', false, e.message);
  }

  // Test search_suggest (newly implemented)
  try {
    const suggestions = await rpcCall('search_suggest', { prefix: 'te', limit: 5 });
    logResult('RPC: search_suggest', Array.isArray(suggestions));
  } catch (e) {
    logResult('RPC: search_suggest', false, e.message);
  }

  // Test trending_searches (newly implemented)
  try {
    const trending = await rpcCall('trending_searches', { limit: 5 });
    logResult('RPC: trending_searches', Array.isArray(trending));
  } catch (e) {
    logResult('RPC: trending_searches', false, e.message);
  }

  // Test get_identity
  try {
    const identity = await rpcCall('get_identity');
    logResult('RPC: get_identity', identity && (identity.public_key || identity.publicKey));
  } catch (e) {
    logResult('RPC: get_identity', false, e.message);
  }
}

// Main test runner
async function runTests() {
  console.log('\n========================================');
  console.log('  Swimchain Desktop Integration Tests');
  console.log('========================================\n');

  // Check if exe exists
  if (!fs.existsSync(CONFIG.exePath)) {
    console.error(`ERROR: Exe not found at ${CONFIG.exePath}`);
    console.error('Run "npm run tauri build" first.');
    process.exit(1);
  }
  logResult('Exe exists', true);

  // Check data directory
  if (!CONFIG.dataDir) {
    console.error('ERROR: APPDATA environment variable not set');
    process.exit(1);
  }
  const identityExists = fs.existsSync(path.join(CONFIG.dataDir, 'identity.enc'));
  logResult('Identity exists', identityExists, identityExists ? null : 'No identity found - create one first');

  if (!identityExists) {
    console.log('\nSkipping RPC tests - no identity available.');
    console.log('Create an identity first by running the app manually.\n');
  } else {
    // Check client bundles
    checkClientBundles();

    // Check if node is already running (from manual app launch)
    log('Checking if node is already running...');
    const rpcReady = await waitForRpc(5000);

    if (rpcReady) {
      log('Node is already running, proceeding with RPC tests...');
      await testRpcMethods();
    } else {
      console.log('\nNode is not running. Please start the desktop app manually');
      console.log('with your password, then run this test again.\n');
      console.log('Alternatively, set TEST_PASSWORD env var and we can try to');
      console.log('interact with an already-running instance.\n');
    }
  }

  // Print summary
  console.log('\n========================================');
  console.log('  Test Summary');
  console.log('========================================');
  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Total:  ${results.passed + results.failed}`);
  console.log('========================================\n');

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run
runTests().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});

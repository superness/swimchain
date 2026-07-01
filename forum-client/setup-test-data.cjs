const http = require('http');

// Parse command line arguments
const args = process.argv.slice(2);
const isRegtest = args.includes('--regtest');

// Port configuration based on network mode
// RPC port = P2P port + 1
// Testnet: P2P 19735 -> RPC 19736
// Regtest: P2P 29735 -> RPC 29736
const RPC_PORT = isRegtest ? 29736 : 19736;
const RPC_HOST = '127.0.0.1';

console.log(`Network mode: ${isRegtest ? 'regtest' : 'testnet'}`);
console.log(`RPC endpoint: http://${RPC_HOST}:${RPC_PORT}`);

async function rpcCall(method, params = {}) {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  });

  const options = {
    hostname: RPC_HOST,
    port: RPC_PORT,
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`RPC Error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
          } else {
            resolve(parsed.result);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(body);
    req.end();
  });
}

async function checkNodeStatus() {
  console.log('\n=== Checking Node Status ===');
  try {
    const status = await rpcCall('get_sync_status');
    console.log('Sync status:', JSON.stringify(status, null, 2));
    return true;
  } catch (err) {
    console.error('Failed to get node status:', err.message);
    return false;
  }
}

async function listSpaces() {
  console.log('\n=== Listing Spaces ===');
  try {
    const spaces = await rpcCall('list_spaces');
    console.log(`Found ${Array.isArray(spaces) ? spaces.length : 0} spaces`);
    if (Array.isArray(spaces) && spaces.length > 0) {
      spaces.slice(0, 5).forEach((space, i) => {
        console.log(`  ${i + 1}. ${space.name || space.id || JSON.stringify(space)}`);
      });
      if (spaces.length > 5) {
        console.log(`  ... and ${spaces.length - 5} more`);
      }
    }
    return spaces;
  } catch (err) {
    console.error('Failed to list spaces:', err.message);
    return [];
  }
}

async function getNodeIdentity() {
  console.log('\n=== Getting Node Identity ===');
  try {
    const identity = await rpcCall('get_node_identity');
    console.log('Node identity:', JSON.stringify(identity, null, 2));
    return identity;
  } catch (err) {
    console.error('Failed to get node identity:', err.message);
    return null;
  }
}

async function main() {
  console.log('\n========================================');
  console.log('  Swimchain Test Data Setup');
  console.log('========================================');

  // Check if node is running
  const nodeUp = await checkNodeStatus();
  if (!nodeUp) {
    console.error('\nError: Node is not running or not reachable.');
    console.log(`Make sure the node is running with ${isRegtest ? '--regtest' : '--testnet'} flag.`);
    process.exit(1);
  }

  // Get node identity
  await getNodeIdentity();

  // List existing spaces
  await listSpaces();

  console.log('\n========================================');
  console.log('  Test Data Setup Complete');
  console.log('========================================\n');
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});

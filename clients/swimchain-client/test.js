/**
 * Quick test of the SwimChain client library
 */

const { swimchainTestnet } = require('./dist/index.js');

async function main() {
  console.log('Creating testnet client...');
  const client = swimchainTestnet(19736);

  console.log('Connecting to node...');
  const connected = await client.connect();
  console.log('Connected:', connected);

  if (connected) {
    const info = client.getRpc().getNodeInfo();
    console.log('Node info:', info);

    try {
      const status = await client.getSyncStatus();
      console.log('Sync status:', status);
    } catch (e) {
      console.log('Sync status error:', e.message);
    }

    try {
      const { spaces, total } = await client.listSpaces();
      console.log(`Spaces: ${total} total`);
      spaces.forEach(s => console.log(`  - ${s.id}: ${s.name} (${s.postCount} posts)`));
    } catch (e) {
      console.log('List spaces error:', e.message);
    }
  }
}

main().catch(console.error);

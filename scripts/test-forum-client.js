/**
 * Test script to simulate what the forum-client does
 * Uses the same RPC library to verify behavior
 */

const http = require('http');
const crypto = require('crypto');

// Hardcoded test identity (same format as forum-client localStorage)
const TEST_SEED = 'c1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6'; // 32 hex chars = 16 bytes
const TEST_PUBKEY = '9b109b5ce57fbff9795d380b6df52275239e16068c7038a7a54ae544d546bca0';

const RPC_URL = 'http://127.0.0.1:19736';

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Make an RPC call with signature authentication
 */
async function rpcCall(method, params = {}) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const paramsJson = JSON.stringify(params);
    const paramsHash = crypto.createHash('sha256').update(paramsJson).digest('hex');
    
    // Create signature message: method + timestamp + params_hash
    const message = method + timestamp + paramsHash;
    const messageHash = crypto.createHash('sha256').update(message).digest();
    
    // For testing, we'll use a dummy signature (Ed25519 would require nacl)
    // Let's just try the call without proper sig to see the response
    
    const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params
    });

    return new Promise((resolve, reject) => {
        const req = http.request(RPC_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'X-Swimchain-Identity': TEST_PUBKEY,
                'X-Swimchain-Timestamp': timestamp,
                'X-Swimchain-Params-Hash': paramsHash,
                // Without proper Ed25519 signature, this will fail
                'X-Swimchain-Signature': 'dummy'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ raw: data });
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function main() {
    console.log('=== Forum Client Test ===\n');
    
    // Test 1: Check if we can connect
    console.log('1. Testing RPC connection (will fail auth without proper sig)...');
    let result = await rpcCall('get_sync_status');
    console.log('Response:', JSON.stringify(result, null, 2));
    
    // If auth failed, we need to use the CLI or proper identity
    if (result.error && result.error.message.includes('Authentication')) {
        console.log('\n[!] Auth failed - need proper Ed25519 signature');
        console.log('[!] The forum-client uses the browser identity stored in localStorage');
        console.log('[!] Let me check the node logs instead to see what RPC calls are happening...\n');
    }
}

main().catch(console.error);

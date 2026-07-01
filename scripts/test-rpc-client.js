const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load identity from genesis-identity directory
const IDENTITY_DIR = path.join(process.cwd(), 'genesis-identity');
const RPC_URL = 'http://127.0.0.1:19736';

async function loadIdentity() {
    // Read the keypair from identity file
    const keypairPath = path.join(IDENTITY_DIR, 'keypair.json');
    if (fs.existsSync(keypairPath)) {
        const data = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
        return {
            publicKey: data.public_key || data.publicKey,
            secretKey: data.secret_key || data.secretKey
        };
    }
    
    // Try alternative paths
    const identityPath = path.join(IDENTITY_DIR, '.identity');
    if (fs.existsSync(identityPath)) {
        const content = fs.readFileSync(identityPath, 'utf8').trim();
        // Parse identity format
        const lines = content.split('\n');
        return { address: lines[0] };
    }
    
    throw new Error('No identity found in ' + IDENTITY_DIR);
}

async function rpcCall(method, params = {}) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const paramsJson = JSON.stringify(params);
    const paramsHash = crypto.createHash('sha256').update(paramsJson).digest('hex');
    
    const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params
    });

    // For now, try without auth to see what happens
    const options = {
        hostname: '127.0.0.1',
        port: 19736,
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
    console.log('=== RPC Debug Client ===\n');
    
    // Try a public method first
    console.log('1. Trying get_sync_status (no auth)...');
    let result = await rpcCall('get_sync_status');
    console.log(JSON.stringify(result, null, 2).slice(0, 500));
    
    console.log('\n2. Trying list_spaces (no auth)...');
    result = await rpcCall('list_spaces');
    console.log(JSON.stringify(result, null, 2).slice(0, 500));
    
    // Check what methods require auth
    console.log('\n3. Checking RPC requirements...');
    
    // Try the CLI directly
    console.log('\n4. Using CLI with identity...');
}

main().catch(console.error);

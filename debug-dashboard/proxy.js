#!/usr/bin/env node
// Simple proxy to add authentication to RPC requests
// Run: node proxy.js [port]
// Then open dashboard at: http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');

const PROXY_PORT = process.argv[2] || 3000;
const BASE_DIR = path.join(__dirname, '..');

// Read node configs dynamically
function getNodeConfigs() {
    const nodes = [];
    const dirs = fs.readdirSync(BASE_DIR).filter(d => d.endsWith('-testnet'));

    for (const dir of dirs) {
        const rpcAddrPath = path.join(BASE_DIR, dir, '.rpc_addr');
        const cookiePath = path.join(BASE_DIR, dir, '.cookie');

        if (fs.existsSync(rpcAddrPath) && fs.existsSync(cookiePath)) {
            const rpcAddr = fs.readFileSync(rpcAddrPath, 'utf8').trim();
            const cookie = fs.readFileSync(cookiePath, 'utf8').trim();
            const name = dir.replace('-testnet', '');
            nodes.push({ name, rpcAddr, cookie });
        }
    }
    return nodes;
}

// Proxy RPC request to node
async function proxyRpc(nodeAddr, cookie, body) {
    return new Promise((resolve, reject) => {
        const auth = Buffer.from(`__cookie__:${cookie}`).toString('base64');
        const [host, port] = nodeAddr.split(':');

        const req = http.request({
            hostname: host,
            port: parseInt(port),
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`,
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', (e) => reject(e));
        req.write(body);
        req.end();
    });
}

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Serve dashboard
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
        const html = fs.readFileSync(path.join(__dirname, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
    }

    // API: list nodes
    if (req.method === 'GET' && req.url === '/api/nodes') {
        const nodes = getNodeConfigs();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(nodes.map(n => ({ name: n.name, port: n.rpcAddr.split(':')[1] }))));
        return;
    }

    // Proxy RPC calls: POST /api/rpc/<node-name>
    if (req.method === 'POST' && req.url.startsWith('/api/rpc/')) {
        const nodeName = req.url.split('/')[3];
        const nodes = getNodeConfigs();
        const node = nodes.find(n => n.name === nodeName);

        if (!node) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Node not found' }));
            return;
        }

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const result = await proxyRpc(node.rpcAddr, node.cookie, body);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(result);
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

server.listen(PROXY_PORT, () => {
    console.log(`Swimchain Debug Dashboard proxy running at http://localhost:${PROXY_PORT}`);
    console.log('Discovered nodes:', getNodeConfigs().map(n => n.name).join(', '));
});

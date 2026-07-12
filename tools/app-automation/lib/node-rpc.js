// Discovers the running node's RPC config so swim-auto can drive clients the way
// the Swimchain launcher/app-shell does: framed, in NODE identity mode.
//
// The launcher hands each app the node's RPC endpoint + cookie auth, then the
// embedded client adopts the node's identity (address from get_identity_info).
// This module reproduces that handoff for the automation harness.
const fs = require('fs');
const path = require('path');
const CFG = require('./config');

// Basic auth header the RPC server expects: username is the literal "__cookie__",
// password is the cookie the node wrote to <data_dir>/.cookie.
function authHeader(cookie) {
  const token = Buffer.from(`__cookie__:${cookie}`).toString('base64');
  return `Basic ${token}`;
}

function readCookie(dataDir) {
  const file = path.join(dataDir, '.cookie');
  return fs.readFileSync(file, 'utf8').trim();
}

async function jsonRpc(endpoint, auth, method, params) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ jsonrpc: '2.0', method, params: params || {}, id: 1 }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message || 'rpc error'}`);
  return body.result;
}

// Resolve the full config the shell wrapper needs to post to a client:
// { endpoint, auth, nodeAddress, nodeDisplayName }.
// Throws if the node isn't running (no cookie) — callers surface that to the shell page.
async function getNodeRpcConfig({ endpoint = CFG.NODE_RPC_URL, dataDir = CFG.NODE_DATA_DIR } = {}) {
  const cookie = readCookie(dataDir); // throws ENOENT if node not started
  const auth = authHeader(cookie);
  const info = await jsonRpc(endpoint, auth, 'get_identity_info');
  const nodeAddress = (info && info.address) || '';
  let nodeDisplayName = '';
  if (nodeAddress) {
    try {
      const prof = await jsonRpc(endpoint, auth, 'get_user_profile', { user_id: nodeAddress });
      nodeDisplayName = (prof && (prof.display_name || prof.name)) || '';
    } catch {
      // Profile is optional; the client falls back to the address.
    }
  }
  return { endpoint, auth, nodeAddress, nodeDisplayName };
}

module.exports = { authHeader, readCookie, jsonRpc, getNodeRpcConfig };

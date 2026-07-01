/**
 * Submit the Sponsorship UI feature to the claudeplus pipeline system.
 * Uses the feature-development-v1 template.
 */
const WebSocket = require('C:\\github\\claudeplus\\proxy\\node_modules\\ws');
const fs = require('fs');
const path = require('path');

// Load template
const template = JSON.parse(
  fs.readFileSync('C:\\github\\claudeplus\\templates\\feature-development-v1.json', 'utf8')
);

// Load design document
const designDoc = fs.readFileSync(
  'C:\\github\\swimchain\\forum-client\\docs\\SPONSORSHIP_UI_DESIGN.md', 'utf8'
);

const ws = new WebSocket('ws://localhost:8081');
const pipelineId = `sponsorship-ui-${Date.now()}`;

ws.on('open', () => {
  console.log(`[CONNECTED] WebSocket connected to proxy`);
  console.log(`[SUBMITTING] Pipeline: ${pipelineId}`);

  const message = {
    type: 'execute-pipeline',
    pipelineId: pipelineId,
    pipeline: {
      ...template,
      name: 'Sponsorship UI Feature Development',
    },
    userContext: `
## Feature: Sponsorship UI for Forum Client

### Project
Swimchain — a decentralized social media protocol (Rust backend + React/TypeScript frontend).
Working directory: /mnt/c/github/swimchain

### Design Document
The following design document describes the complete feature to implement:

${designDoc}

### Build & Test Commands
- Rust backend: cargo build, cargo test --all-targets, cargo clippy --all-targets --all-features -- -A clippy::unreadable_literal -A clippy::similar_names -A clippy::redundant_else -W clippy::all
- Forum client: cd forum-client && npm run build (tsc -b && vite build)

### Key Context
- The Rust backend uses sled embedded database, Ed25519 cryptography, and a JSON-RPC server
- The forum-client is React/Vite/TypeScript communicating via JSON-RPC over HTTP
- OfferStore (src/sponsorship/offer_store.rs) is fully implemented but only wired to CLI, NOT to node manager or RPC
- SponsorshipStore is wired to the node and accessible via RPC
- WASM bindings provide Ed25519 signing in the browser
- Existing patterns to follow: useSponsorship hook, SponsorshipBanner component, InviteModal for modal patterns

### Implementation Priority
Focus on Phase 0 (on-chain validation fix) and Phase 2 (RPC endpoints) first, as these are backend-only and foundational. Then Phase 3-6 for the frontend.

### Important Notes
- This is a Windows environment, use Windows paths in commands (or /mnt/c/ paths in WSL)
- The node binary is sw.exe (built from src/bin/cs.rs)
- Follow existing code patterns and conventions
- All write RPC operations require Ed25519 signature verification
- PoW mining is required for claims (reuse existing useActionPow hook pattern)
`,
    workingDirectory: '/mnt/c/github/swimchain',
  };

  ws.send(JSON.stringify(message));
  console.log(`[SENT] Pipeline execution request`);
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    const timestamp = new Date().toISOString().slice(11, 19);

    switch (msg.type) {
      case 'pipeline-started':
        console.log(`[${timestamp}] PIPELINE STARTED: ${msg.pipelineId || pipelineId}`);
        if (msg.infographicUrl) {
          console.log(`[${timestamp}] INFOGRAPHIC: ${msg.infographicUrl}`);
        }
        break;

      case 'infographic-ready':
        console.log(`[${timestamp}] INFOGRAPHIC READY: ${msg.url || msg.infographicUrl}`);
        break;

      case 'stage-started':
        console.log(`[${timestamp}] STAGE STARTED: ${msg.stageId || msg.stageName} — ${msg.description || ''}`);
        break;

      case 'stage-completed':
        console.log(`[${timestamp}] STAGE COMPLETED: ${msg.stageId || msg.stageName} — decision: ${msg.decision || 'n/a'}`);
        break;

      case 'pipeline-stage-update':
        console.log(`[${timestamp}] STAGE UPDATE: ${msg.stageId || ''} — ${msg.status || msg.message || ''}`);
        break;

      case 'pipeline-complete':
        console.log(`[${timestamp}] PIPELINE COMPLETE`);
        if (msg.summary) console.log(`Summary: ${msg.summary}`);
        process.exit(0);
        break;

      case 'pipeline-error':
        console.error(`[${timestamp}] PIPELINE ERROR: ${msg.error || msg.message}`);
        process.exit(1);
        break;

      case 'system-status':
        console.log(`[${timestamp}] SYSTEM: ${msg.message || JSON.stringify(msg)}`);
        break;

      default:
        console.log(`[${timestamp}] ${msg.type}: ${JSON.stringify(msg).slice(0, 200)}`);
    }
  } catch (e) {
    console.log(`[RAW] ${data.toString().slice(0, 500)}`);
  }
});

ws.on('error', (err) => {
  console.error(`[ERROR] WebSocket error: ${err.message}`);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log(`[CLOSED] WebSocket closed: code=${code} reason=${reason || 'none'}`);
  process.exit(0);
});

// Keep alive — pipeline can run for a while
process.on('SIGINT', () => {
  console.log('\n[INTERRUPTED] Closing connection...');
  ws.close();
  process.exit(0);
});

#!/usr/bin/env node
/**
 * Feature Documentation Agent
 *
 * This script gives an AI agent full control over:
 * - Node lifecycle (start/stop/health)
 * - Browser automation (navigate/click/type/screenshot)
 * - RPC calls to the node
 *
 * Usage: node document-feature.js "Feature Name"
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const SCRIPTS_DIR = __dirname;
const PROJECT_ROOT = path.join(__dirname, '..');
const DOCS_DIR = path.join(PROJECT_ROOT, 'forum-client/docs/features');

// Ensure docs directory exists
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

class FeatureDocumenter {
  constructor(featureName) {
    this.featureName = featureName;
    this.featureSlug = featureName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    this.screenshots = [];
    this.notes = [];
  }

  // ============ NODE CONTROL ============

  async startServices() {
    console.log('[AGENT] Starting services...');
    try {
      execSync('node daemon-control.js start', {
        cwd: SCRIPTS_DIR,
        stdio: 'inherit'
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async stopServices() {
    console.log('[AGENT] Stopping services...');
    try {
      execSync('node daemon-control.js stop', {
        cwd: SCRIPTS_DIR,
        stdio: 'inherit'
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async checkHealth() {
    try {
      execSync('node daemon-control.js health', {
        cwd: SCRIPTS_DIR,
        stdio: 'pipe'
      });
      return { healthy: true };
    } catch (e) {
      return { healthy: false };
    }
  }

  async getStatus() {
    try {
      const output = execSync('node daemon-control.js status', {
        cwd: SCRIPTS_DIR,
        encoding: 'utf8'
      });
      return { status: output };
    } catch (e) {
      return { error: e.message };
    }
  }

  // ============ BROWSER CONTROL ============

  async navigate(url) {
    console.log(`[AGENT] Navigating to: ${url}`);
    try {
      execSync(`node browser-control.js navigate "${url}"`, {
        cwd: SCRIPTS_DIR,
        stdio: 'inherit'
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async screenshot(name) {
    const filename = `${this.featureSlug}-${name}.png`;
    const filepath = path.join(DOCS_DIR, filename);
    console.log(`[AGENT] Taking screenshot: ${filename}`);
    try {
      execSync(`node browser-control.js screenshot --output="${filepath}"`, {
        cwd: SCRIPTS_DIR,
        stdio: 'inherit'
      });
      this.screenshots.push({ name, filename, filepath });
      return { success: true, filename };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async click(selector) {
    console.log(`[AGENT] Clicking: ${selector}`);
    try {
      execSync(`node browser-control.js click "${selector}"`, {
        cwd: SCRIPTS_DIR,
        stdio: 'inherit'
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async type(selector, text) {
    console.log(`[AGENT] Typing into: ${selector}`);
    try {
      execSync(`node browser-control.js type "${selector}" "${text}"`, {
        cwd: SCRIPTS_DIR,
        stdio: 'inherit'
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async evaluate(script) {
    console.log(`[AGENT] Evaluating script...`);
    try {
      const output = execSync(`node browser-control.js evaluate "${script}"`, {
        cwd: SCRIPTS_DIR,
        encoding: 'utf8'
      });
      return { success: true, result: output };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async wait(ms) {
    console.log(`[AGENT] Waiting ${ms}ms...`);
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============ RPC CALLS ============

  async rpc(method, params = {}) {
    return new Promise((resolve) => {
      const data = JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: Date.now()
      });

      const req = http.request({
        hostname: 'localhost',
        port: 29736,
        path: '/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve({ success: true, result: json.result, error: json.error });
          } catch (e) {
            resolve({ success: false, error: 'Invalid JSON response' });
          }
        });
      });

      req.on('error', (e) => {
        resolve({ success: false, error: e.message });
      });

      req.write(data);
      req.end();
    });
  }

  // ============ DOCUMENTATION ============

  addNote(note) {
    this.notes.push(note);
    console.log(`[AGENT] Note: ${note}`);
  }

  generateMarkdown() {
    let md = `# ${this.featureName}\n\n`;

    if (this.notes.length > 0) {
      md += `## Description\n\n`;
      this.notes.forEach(note => {
        md += `${note}\n\n`;
      });
    }

    if (this.screenshots.length > 0) {
      md += `## Screenshots\n\n`;
      this.screenshots.forEach(ss => {
        md += `### ${ss.name}\n\n`;
        md += `![${ss.name}](${ss.filename})\n\n`;
      });
    }

    return md;
  }

  saveDocumentation() {
    const mdPath = path.join(DOCS_DIR, `${this.featureSlug}.md`);
    const md = this.generateMarkdown();
    fs.writeFileSync(mdPath, md);
    console.log(`[AGENT] Documentation saved to: ${mdPath}`);
    return mdPath;
  }
}

// ============ MAIN: Document "Identity Display" Feature ============

async function documentIdentityDisplay() {
  const agent = new FeatureDocumenter('Identity Display');

  console.log('\n========================================');
  console.log('  Documenting Feature: Identity Display');
  console.log('========================================\n');

  // 1. Check if services are running
  agent.addNote('The Identity Display feature shows the current user\'s identity in the UI header.');

  let health = await agent.checkHealth();
  if (!health.healthy) {
    console.log('[AGENT] Services not running, starting them...');
    await agent.startServices();
    await agent.wait(5000);
  }

  // 2. Get node identity via RPC
  const identityResult = await agent.rpc('get_identity_info');
  if (identityResult.success && identityResult.result) {
    const addr = identityResult.result.address;
    const pubkey = identityResult.result.public_key;
    agent.addNote(`Node identity address: \`${addr}\``);
    agent.addNote(`Node identity public key: \`${pubkey.substring(0, 16)}...\``);
  } else {
    agent.addNote('Warning: Could not fetch node identity via RPC.');
  }

  // 3. Navigate to the forum client
  await agent.navigate('http://localhost:5173');
  await agent.wait(3000);

  // 4. Take screenshot of identity display
  await agent.screenshot('header-identity');
  agent.addNote('The identity is displayed in the top-right corner of the UI.');
  agent.addNote('It shows an avatar (initials or image) and a truncated address.');

  // 5. Navigate to identity page for more details
  await agent.navigate('http://localhost:5173/identity');
  await agent.wait(2000);
  await agent.screenshot('identity-page');
  agent.addNote('The /identity page shows the full identity details including:');
  agent.addNote('- Full address (Bech32m format starting with `cs1`...)');
  agent.addNote('- Public key');
  agent.addNote('- QR code for sharing');
  agent.addNote('- Options to export/backup the identity');

  // 6. Save documentation
  const docPath = agent.saveDocumentation();

  console.log('\n========================================');
  console.log('  Feature Documentation Complete!');
  console.log(`  Output: ${docPath}`);
  console.log('========================================\n');

  return docPath;
}

// Run
documentIdentityDisplay().catch(console.error);

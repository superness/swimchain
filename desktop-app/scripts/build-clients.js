/**
 * Build all client apps and copy to desktop-app dist folder
 *
 * This script builds each client (forum, chat, feed, search, wiki)
 * and copies the built files to dist/clients/{name}-client/
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const DIST_DIR = path.resolve(__dirname, '../dist');
const CLIENTS_DIR = path.join(DIST_DIR, 'clients');

const CLIENTS = ['forum', 'chat', 'feed', 'search', 'wiki'];

function log(message) {
  console.log(`[build-clients] ${message}`);
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    log(`  Warning: ${src} does not exist, skipping`);
    return false;
  }

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  return true;
}

async function buildClient(clientName) {
  const clientDir = path.join(ROOT_DIR, `${clientName}-client`);

  if (!fs.existsSync(clientDir)) {
    log(`  ${clientName}-client directory not found, skipping`);
    return false;
  }

  log(`Building ${clientName}-client...`);

  try {
    // Install dependencies if needed
    if (!fs.existsSync(path.join(clientDir, 'node_modules'))) {
      log(`  Installing dependencies for ${clientName}-client...`);
      execSync('npm install', { cwd: clientDir, stdio: 'inherit' });
    }

    // Build the client
    execSync('npm run build', { cwd: clientDir, stdio: 'inherit' });

    // Copy dist to clients folder
    const clientDistDir = path.join(clientDir, 'dist');
    const destDir = path.join(CLIENTS_DIR, `${clientName}-client`);

    if (fs.existsSync(clientDistDir)) {
      log(`  Copying ${clientName}-client dist to ${destDir}`);
      copyDirSync(clientDistDir, destDir);
      return true;
    } else {
      log(`  Warning: ${clientDistDir} does not exist after build`);
      return false;
    }
  } catch (error) {
    log(`  Error building ${clientName}-client: ${error.message}`);
    return false;
  }
}

async function main() {
  log('Starting client builds...');

  // Ensure clients directory exists
  fs.mkdirSync(CLIENTS_DIR, { recursive: true });

  const results = {};

  for (const client of CLIENTS) {
    results[client] = await buildClient(client);
  }

  log('');
  log('Build Summary:');
  for (const [client, success] of Object.entries(results)) {
    log(`  ${client}-client: ${success ? 'OK' : 'FAILED'}`);
  }

  const failedCount = Object.values(results).filter(x => !x).length;
  if (failedCount > 0) {
    log(`\n${failedCount} client(s) failed to build.`);
    process.exit(1);
  }

  log('\nAll clients built successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

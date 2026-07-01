#!/usr/bin/env node
/**
 * browser-control.js - Wrapper for claudeplus proxy browser automation endpoints
 *
 * Usage:
 *   node scripts/browser-control.js init
 *   node scripts/browser-control.js launch
 *   node scripts/browser-control.js navigate <url>
 *   node scripts/browser-control.js screenshot [--output=file.png]
 *   node scripts/browser-control.js click <selector>
 *   node scripts/browser-control.js type <selector> <text>
 *   node scripts/browser-control.js evaluate <script>
 *   node scripts/browser-control.js close
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    proxyHost: process.env.CLAUDEPLUS_PROXY_HOST || '127.0.0.1',
    proxyPort: parseInt(process.env.CLAUDEPLUS_PROXY_PORT || '8081', 10),
    timeout: parseInt(process.env.BROWSER_TIMEOUT || '30000', 10),
    sessionFile: path.join(__dirname, '../.daemon-pids/browser-session.json'),
};

// Colors for terminal output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
};

function log(color, message) {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Session management
function saveSession(sessionId) {
    const dir = path.dirname(CONFIG.sessionFile);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG.sessionFile, JSON.stringify({ sessionId, timestamp: Date.now() }));
}

function loadSession() {
    try {
        if (fs.existsSync(CONFIG.sessionFile)) {
            const data = JSON.parse(fs.readFileSync(CONFIG.sessionFile, 'utf8'));
            return data.sessionId;
        }
    } catch (e) {
        // ignore
    }
    return null;
}

function clearSession() {
    try {
        if (fs.existsSync(CONFIG.sessionFile)) {
            fs.unlinkSync(CONFIG.sessionFile);
        }
    } catch (e) {
        // ignore
    }
}

/**
 * Make an HTTP request to the claudeplus proxy browser automation endpoint
 */
function request(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
        const bodyStr = body ? JSON.stringify(body) : null;

        const options = {
            hostname: CONFIG.proxyHost,
            port: CONFIG.proxyPort,
            path: `/browser-${endpoint}`,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(bodyStr && { 'Content-Length': Buffer.byteLength(bodyStr) }),
            },
            timeout: CONFIG.timeout,
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(result);
                    } else {
                        reject(new Error(result.error || result.message || `HTTP ${res.statusCode}`));
                    }
                } catch {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ raw: data });
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                }
            });
        });

        req.on('error', (e) => reject(new Error(`Connection failed: ${e.message}`)));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (bodyStr) {
            req.write(bodyStr);
        }
        req.end();
    });
}

// For /browser-init which uses a different path
function requestInit() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: CONFIG.proxyHost,
            port: CONFIG.proxyPort,
            path: '/browser-init',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            timeout: CONFIG.timeout,
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(result);
                    } else {
                        reject(new Error(result.error || `HTTP ${res.statusCode}`));
                    }
                } catch {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ raw: data });
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                }
            });
        });

        req.on('error', (e) => reject(new Error(`Connection failed: ${e.message}`)));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

// Command implementations

async function init() {
    log('blue', 'Initializing browser automation service...');
    const result = await requestInit();
    log('green', 'Browser automation initialized');
    return result;
}

async function launch() {
    log('blue', 'Launching browser...');
    const result = await request('POST', 'launch', {});
    // Handle nested response structure
    let sessionId = result.result?.sessionId || result.result || result.sessionId;
    if (typeof sessionId === 'object' && sessionId.sessionId) {
        sessionId = sessionId.sessionId;
    }
    if (sessionId) {
        saveSession(sessionId);
        log('green', `Browser launched. Session: ${sessionId}`);
    } else {
        log('green', 'Browser launched');
    }
    return result;
}

async function navigate(url) {
    if (!url) {
        throw new Error('URL is required');
    }
    const sessionId = loadSession();
    if (!sessionId) {
        throw new Error('No browser session. Run: browser-control launch');
    }
    log('blue', `Navigating to: ${url}`);
    const result = await request('POST', 'navigate', { sessionId, url });
    log('green', 'Navigation complete');
    return result;
}

async function screenshot(outputPath) {
    const sessionId = loadSession();
    if (!sessionId) {
        throw new Error('No browser session. Run: browser-control launch');
    }
    log('blue', 'Taking screenshot...');
    const filePath = outputPath || `screenshot-${Date.now()}.png`;
    const result = await request('POST', 'screenshot', { sessionId, path: path.resolve(filePath) });
    log('green', `Screenshot saved: ${filePath}`);
    return { file: filePath, ...result };
}

async function click(selector) {
    if (!selector) {
        throw new Error('Selector is required');
    }
    const sessionId = loadSession();
    if (!sessionId) {
        throw new Error('No browser session. Run: browser-control launch');
    }
    log('blue', `Clicking: ${selector}`);
    const result = await request('POST', 'click', { sessionId, selector });
    log('green', 'Click executed');
    return result;
}

async function type(selector, text) {
    if (!selector || text === undefined) {
        throw new Error('Selector and text are required');
    }
    const sessionId = loadSession();
    if (!sessionId) {
        throw new Error('No browser session. Run: browser-control launch');
    }
    log('blue', `Typing into: ${selector}`);
    const result = await request('POST', 'type', { sessionId, selector, text });
    log('green', 'Text entered');
    return result;
}

async function evaluate(script) {
    if (!script) {
        throw new Error('Script is required');
    }
    const sessionId = loadSession();
    if (!sessionId) {
        throw new Error('No browser session. Run: browser-control launch');
    }
    log('blue', 'Evaluating script...');
    const result = await request('POST', 'evaluate', { sessionId, script });
    if (result.result !== undefined) {
        log('green', `Result: ${JSON.stringify(result.result)}`);
    }
    return result;
}

async function closeBrowser() {
    const sessionId = loadSession();
    if (!sessionId) {
        log('yellow', 'No browser session to close');
        return { success: true };
    }
    log('blue', 'Closing browser...');
    try {
        const result = await request('POST', 'close', { sessionId });
        clearSession();
        log('green', 'Browser closed');
        return result;
    } catch (e) {
        clearSession();
        log('yellow', `Close failed (session cleared): ${e.message}`);
        return { success: true };
    }
}

async function getConsoleLogs(filter) {
    const sessionId = loadSession();
    if (!sessionId) {
        throw new Error('No browser session. Run: browser-control launch');
    }
    log('blue', 'Getting console logs...');
    const result = await request('POST', 'get-console-logs', { sessionId, filter });
    if (result.result) {
        console.log(JSON.stringify(result.result, null, 2));
    }
    return result;
}

// Parse arguments
function parseArgs(args) {
    const result = { _: [] };
    for (const arg of args) {
        if (arg.startsWith('--')) {
            const [key, value] = arg.slice(2).split('=');
            result[key] = value === undefined ? true : value;
        } else {
            result._.push(arg);
        }
    }
    return result;
}

// Main command handling
async function main() {
    const args = parseArgs(process.argv.slice(2));
    const command = args._[0];

    try {
        switch (command) {
            case 'init':
                await init();
                break;

            case 'launch':
            case 'start':
                await launch();
                break;

            case 'navigate':
            case 'goto':
            case 'open':
                await navigate(args._[1]);
                break;

            case 'screenshot':
            case 'capture':
                await screenshot(args.output || args.o);
                break;

            case 'click':
                await click(args._[1]);
                break;

            case 'type':
            case 'input':
                await type(args._[1], args._.slice(2).join(' '));
                break;

            case 'evaluate':
            case 'eval':
            case 'exec':
                await evaluate(args._.slice(1).join(' '));
                break;

            case 'logs':
            case 'console':
                await getConsoleLogs(args.filter);
                break;

            case 'close':
            case 'quit':
                await closeBrowser();
                break;

            case 'session':
                const sessionId = loadSession();
                if (sessionId) {
                    log('green', `Current session: ${sessionId}`);
                } else {
                    log('yellow', 'No active session');
                }
                break;

            default:
                console.log(`
${colors.cyan}Browser Control - Wrapper for claudeplus proxy browser automation${colors.reset}

Usage:
  node scripts/browser-control.js <command> [options]

Commands:
  init                          Initialize browser automation service
  launch                        Launch a new browser session
  navigate <url>                Navigate to a URL
  screenshot [--output=file]    Take a screenshot
  click <selector>              Click an element
  type <selector> <text>        Type text into an input
  evaluate <script>             Execute JavaScript in the page
  logs [--filter=type]          Get console logs
  close                         Close the browser session
  session                       Show current session ID

Environment Variables:
  CLAUDEPLUS_PROXY_HOST         Proxy host (default: 127.0.0.1)
  CLAUDEPLUS_PROXY_PORT         Proxy port (default: 8081)
  BROWSER_TIMEOUT               Request timeout in ms (default: 30000)

Examples:
  node scripts/browser-control.js init
  node scripts/browser-control.js launch
  node scripts/browser-control.js navigate http://localhost:5173
  node scripts/browser-control.js screenshot --output=page.png
  node scripts/browser-control.js click "button.submit"
  node scripts/browser-control.js type "#username" "testuser"
  node scripts/browser-control.js eval "document.title"
  node scripts/browser-control.js close
`);
                break;
        }
    } catch (e) {
        log('red', `Error: ${e.message}`);
        process.exit(1);
    }
}

// Export for programmatic use
module.exports = {
    init,
    launch,
    navigate,
    screenshot,
    click,
    type,
    evaluate,
    closeBrowser,
    getConsoleLogs,
    loadSession,
    saveSession,
    clearSession,
    request,
    CONFIG,
};

// Run if executed directly
if (require.main === module) {
    main().catch((e) => {
        log('red', `Fatal: ${e.message}`);
        process.exit(1);
    });
}

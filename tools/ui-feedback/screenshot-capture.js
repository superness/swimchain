#!/usr/bin/env node
/**
 * screenshot-capture.js - Screenshot utility for UI feedback tool
 *
 * Captures screenshots from web UIs using Puppeteer with configurable options.
 * Supports full page, viewport, and element-specific captures.
 *
 * Usage:
 *   node screenshot-capture.js <url> [options]
 *
 * Options:
 *   --output, -o     Output file path (default: output/screenshot-{timestamp}.png)
 *   --fullPage       Capture full scrollable page (default: false)
 *   --width          Viewport width (default: 1920)
 *   --height         Viewport height (default: 1080)
 *   --selector       Capture specific element by CSS selector
 *   --wait           Wait time in ms before capture (default: 2000)
 *   --waitFor        CSS selector to wait for before capture
 *   --format         Output format: png or jpeg (default: png)
 *   --quality        JPEG quality 0-100 (default: 80)
 *   --deviceScale    Device scale factor (default: 1)
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Default configuration
const DEFAULT_CONFIG = {
    width: 1920,
    height: 1080,
    fullPage: false,
    wait: 2000,
    format: 'png',
    quality: 80,
    deviceScale: 1,
    timeout: 30000,
};

// Colors for terminal output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    reset: '\x1b[0m',
};

function log(color, message) {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Parse command line arguments
 */
function parseArgs(args) {
    const result = { _: [] };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const nextArg = args[i + 1];
            if (nextArg && !nextArg.startsWith('-')) {
                result[key] = nextArg;
                i++;
            } else {
                result[key] = true;
            }
        } else if (arg.startsWith('-') && arg.length === 2) {
            const key = arg.slice(1);
            const nextArg = args[i + 1];
            if (nextArg && !nextArg.startsWith('-')) {
                result[key] = nextArg;
                i++;
            } else {
                result[key] = true;
            }
        } else {
            result._.push(arg);
        }
    }
    return result;
}

/**
 * Ensure output directory exists
 */
function ensureOutputDir(outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * Generate output path with timestamp
 */
function generateOutputPath(basePath, format) {
    if (basePath) return basePath;
    const outputDir = path.join(__dirname, 'output');
    ensureOutputDir(path.join(outputDir, 'placeholder'));
    return path.join(outputDir, `screenshot-${timestamp()}.${format}`);
}

/**
 * Capture screenshot from URL
 * @param {string} url - Target URL
 * @param {Object} options - Capture options
 * @returns {Promise<{path: string, dimensions: {width: number, height: number}}>}
 */
async function captureScreenshot(url, options = {}) {
    const config = { ...DEFAULT_CONFIG, ...options };

    log('blue', `Launching browser...`);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            `--window-size=${config.width},${config.height}`,
        ],
    });

    try {
        const page = await browser.newPage();

        // Set viewport
        await page.setViewport({
            width: parseInt(config.width, 10),
            height: parseInt(config.height, 10),
            deviceScaleFactor: parseFloat(config.deviceScale),
        });

        log('blue', `Navigating to: ${url}`);

        // Navigate to URL
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: config.timeout,
        });

        // Wait for specific selector if provided
        if (config.waitFor) {
            log('dim', `Waiting for selector: ${config.waitFor}`);
            await page.waitForSelector(config.waitFor, { timeout: config.timeout });
        }

        // Additional wait time
        if (config.wait > 0) {
            log('dim', `Waiting ${config.wait}ms for page to settle...`);
            await new Promise(resolve => setTimeout(resolve, parseInt(config.wait, 10)));
        }

        // Generate output path
        const outputPath = generateOutputPath(config.output || config.o, config.format);
        ensureOutputDir(outputPath);

        // Screenshot options
        const screenshotOptions = {
            path: outputPath,
            type: config.format,
            fullPage: config.fullPage === true || config.fullPage === 'true',
        };

        if (config.format === 'jpeg') {
            screenshotOptions.quality = parseInt(config.quality, 10);
        }

        // Capture specific element or full page
        if (config.selector) {
            log('dim', `Capturing element: ${config.selector}`);
            const element = await page.$(config.selector);
            if (!element) {
                throw new Error(`Element not found: ${config.selector}`);
            }
            await element.screenshot(screenshotOptions);
        } else {
            await page.screenshot(screenshotOptions);
        }

        // Get page dimensions
        const dimensions = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
        }));

        // Get page title
        const title = await page.title();

        const stats = fs.statSync(outputPath);

        log('green', `Screenshot saved: ${outputPath}`);
        log('dim', `  Size: ${(stats.size / 1024).toFixed(1)} KB`);
        log('dim', `  Dimensions: ${dimensions.viewportWidth}x${dimensions.viewportHeight}`);
        if (title) {
            log('dim', `  Page title: ${title}`);
        }

        return {
            path: outputPath,
            absolutePath: path.resolve(outputPath),
            size: stats.size,
            dimensions,
            title,
            url,
            timestamp: new Date().toISOString(),
        };

    } finally {
        await browser.close();
    }
}

/**
 * Capture multiple screenshots with different viewports
 * @param {string} url - Target URL
 * @param {Array<{name: string, width: number, height: number}>} viewports - Viewport configs
 * @param {Object} baseOptions - Base options for all captures
 * @returns {Promise<Array<{viewport: string, result: Object}>>}
 */
async function captureMultipleViewports(url, viewports, baseOptions = {}) {
    const results = [];

    for (const viewport of viewports) {
        const options = {
            ...baseOptions,
            width: viewport.width,
            height: viewport.height,
            output: baseOptions.outputDir
                ? path.join(baseOptions.outputDir, `${viewport.name}-${timestamp()}.png`)
                : undefined,
        };

        log('cyan', `\nCapturing viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);

        try {
            const result = await captureScreenshot(url, options);
            results.push({ viewport: viewport.name, ...result });
        } catch (error) {
            log('red', `Failed to capture ${viewport.name}: ${error.message}`);
            results.push({ viewport: viewport.name, error: error.message });
        }
    }

    return results;
}

// Preset viewports for responsive testing
const PRESET_VIEWPORTS = {
    desktop: { name: 'desktop', width: 1920, height: 1080 },
    laptop: { name: 'laptop', width: 1366, height: 768 },
    tablet: { name: 'tablet', width: 768, height: 1024 },
    mobile: { name: 'mobile', width: 375, height: 667 },
};

/**
 * Show usage help
 */
function showHelp() {
    console.log(`
${colors.cyan}UI Feedback Screenshot Capture Tool${colors.reset}

Usage:
  node screenshot-capture.js <url> [options]

Options:
  --output, -o     Output file path (default: output/screenshot-{timestamp}.png)
  --fullPage       Capture full scrollable page
  --width          Viewport width (default: 1920)
  --height         Viewport height (default: 1080)
  --selector       Capture specific element by CSS selector
  --wait           Wait time in ms before capture (default: 2000)
  --waitFor        CSS selector to wait for before capture
  --format         Output format: png or jpeg (default: png)
  --quality        JPEG quality 0-100 (default: 80, jpeg only)
  --deviceScale    Device scale factor (default: 1)
  --responsive     Capture all preset viewports (desktop, laptop, tablet, mobile)

Examples:
  # Basic screenshot
  node screenshot-capture.js http://localhost:5173

  # Full page capture with custom output
  node screenshot-capture.js http://localhost:5173 --fullPage --output=./full-page.png

  # Wait for specific element
  node screenshot-capture.js http://localhost:5173 --waitFor=".main-content" --wait=3000

  # Capture specific element
  node screenshot-capture.js http://localhost:5173 --selector=".header"

  # Mobile viewport
  node screenshot-capture.js http://localhost:5173 --width=375 --height=667

  # Responsive capture (all viewports)
  node screenshot-capture.js http://localhost:5173 --responsive

Output:
  Screenshots are saved to ./output/ directory by default.
  Returns JSON metadata including path, dimensions, and timestamp.
`);
}

// Main CLI handler
async function main() {
    const args = parseArgs(process.argv.slice(2));
    const url = args._[0];

    if (!url || args.help || args.h) {
        showHelp();
        process.exit(url ? 0 : 1);
    }

    try {
        if (args.responsive) {
            // Capture all preset viewports
            const viewports = Object.values(PRESET_VIEWPORTS);
            const results = await captureMultipleViewports(url, viewports, {
                outputDir: path.join(__dirname, 'output'),
                wait: args.wait,
                waitFor: args.waitFor,
            });

            console.log('\n' + JSON.stringify({ url, captures: results }, null, 2));
        } else {
            // Single capture
            const result = await captureScreenshot(url, args);
            console.log('\n' + JSON.stringify(result, null, 2));
        }
    } catch (error) {
        log('red', `Error: ${error.message}`);
        process.exit(1);
    }
}

// Export for programmatic use
module.exports = {
    captureScreenshot,
    captureMultipleViewports,
    PRESET_VIEWPORTS,
    DEFAULT_CONFIG,
};

// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        log('red', `Fatal: ${error.message}`);
        process.exit(1);
    });
}

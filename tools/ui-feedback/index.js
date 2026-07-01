#!/usr/bin/env node
/**
 * UI Feedback Tool - Main Orchestrator
 *
 * Captures screenshots of web UIs and generates multi-perspective feedback
 * from different stakeholder viewpoints (developer, user, product owner, QA tester).
 *
 * Usage:
 *   node index.js <url> [options]
 *   node index.js --analyze <screenshot-path>
 *
 * Options:
 *   --output, -o       Output directory (default: ./output)
 *   --perspectives     Comma-separated list: developer,user,product,qa (default: all)
 *   --format           Report format: json, markdown, or both (default: both)
 *   --viewport         Viewport preset: desktop, laptop, tablet, mobile (default: desktop)
 *   --analyze          Analyze existing screenshot instead of capturing new one
 *   --execute          Execute recommended improvements after analysis
 *   --wait             Wait time before screenshot in ms (default: 2000)
 *   --waitFor          CSS selector to wait for before screenshot
 */

const path = require('path');
const fs = require('fs');
const { captureScreenshot, PRESET_VIEWPORTS } = require('./screenshot-capture');

// Output organization
const OUTPUT_STRUCTURE = {
    screenshots: 'screenshots',
    reports: 'reports',
    analysis: 'analysis',
    improvements: 'improvements',
};

// Perspective definitions
const PERSPECTIVES = {
    developer: {
        name: 'Developer',
        focus: [
            'Code quality indicators visible in UI',
            'Console errors or warnings',
            'Performance indicators (loading states, spinners)',
            'Accessibility attributes (aria labels, focus states)',
            'Responsive design implementation',
            'Component consistency',
            'Error handling UX',
        ],
        promptTemplate: `As a frontend developer reviewing this UI screenshot, analyze:
1. Technical implementation quality visible in the UI
2. Are there visible loading states, error states, or edge cases?
3. Does the layout handle different content lengths gracefully?
4. Are interactive elements clearly identifiable?
5. Is the component hierarchy logical and consistent?
6. Any visible accessibility concerns (contrast, focus indicators)?
7. Performance indicators (unnecessary complexity, potential bottlenecks)?`,
    },
    user: {
        name: 'End User',
        focus: [
            'Intuitive navigation',
            'Clear call-to-actions',
            'Visual hierarchy',
            'Information clarity',
            'Ease of task completion',
            'Trust and credibility signals',
            'Mobile-friendliness',
        ],
        promptTemplate: `As an end user seeing this interface for the first time, evaluate:
1. Can I immediately understand what this page/screen does?
2. Is the main action obvious and easy to find?
3. Is the information organized in a way that makes sense?
4. Does anything confuse me or require extra thought?
5. Do I trust this interface with my data/actions?
6. Are labels and instructions clear?
7. Would I want to use this regularly?`,
    },
    product: {
        name: 'Product Owner',
        focus: [
            'Business goals alignment',
            'User journey clarity',
            'Conversion optimization',
            'Feature discoverability',
            'Brand consistency',
            'Competitive positioning',
            'Value proposition clarity',
        ],
        promptTemplate: `As a product owner evaluating this UI for business impact, assess:
1. Does this UI clearly communicate our value proposition?
2. Is the primary user journey obvious and optimized?
3. Are key features discoverable without cluttering the interface?
4. Does this align with our brand guidelines and voice?
5. What conversion barriers might exist?
6. How does this compare to competitor solutions?
7. Are there opportunities to improve engagement metrics?`,
    },
    qa: {
        name: 'QA Tester',
        focus: [
            'Edge case handling',
            'Error states',
            'Input validation feedback',
            'Cross-browser consistency',
            'Responsive breakpoints',
            'Accessibility compliance',
            'State management visibility',
        ],
        promptTemplate: `As a QA tester examining this UI for potential issues, check:
1. Are there visible edge cases that might break (long text, empty states)?
2. How are error states communicated to users?
3. Is form validation feedback clear and helpful?
4. Are all interactive elements properly styled for their states?
5. Does the layout appear stable or might it shift?
6. Are there accessibility issues (contrast, labels, keyboard navigation)?
7. What scenarios should be tested based on this UI?`,
    },
};

// Colors for terminal output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
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
 * Initialize output directory structure
 */
function initOutputStructure(baseDir) {
    const dirs = {};
    for (const [key, subdir] of Object.entries(OUTPUT_STRUCTURE)) {
        const fullPath = path.join(baseDir, subdir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
        dirs[key] = fullPath;
    }
    return dirs;
}

/**
 * Generate feedback analysis structure (placeholder for LLM integration)
 * In real usage, this would call Claude or another LLM with the screenshot
 */
function generatePerspectiveFeedback(screenshotPath, perspective) {
    const perspectiveConfig = PERSPECTIVES[perspective];
    if (!perspectiveConfig) {
        throw new Error(`Unknown perspective: ${perspective}`);
    }

    return {
        perspective: perspectiveConfig.name,
        focusAreas: perspectiveConfig.focus,
        prompt: perspectiveConfig.promptTemplate,
        screenshotPath,
        // Placeholder for actual analysis results
        // In real usage, send screenshot + prompt to vision-capable LLM
        analysisPlaceholder: `[Analysis from ${perspectiveConfig.name} perspective would be generated here using vision LLM]`,
    };
}

/**
 * Generate markdown report from feedback
 */
function generateMarkdownReport(url, screenshotInfo, feedbackResults, outputPath) {
    const ts = new Date().toISOString();
    const lines = [
        `# UI Feedback Report`,
        ``,
        `**URL:** ${url}`,
        `**Generated:** ${ts}`,
        `**Screenshot:** ${screenshotInfo.path}`,
        ``,
        `---`,
        ``,
    ];

    for (const feedback of feedbackResults) {
        lines.push(`## ${feedback.perspective} Perspective`);
        lines.push(``);
        lines.push(`### Focus Areas`);
        for (const area of feedback.focusAreas) {
            lines.push(`- ${area}`);
        }
        lines.push(``);
        lines.push(`### Analysis Prompt`);
        lines.push(`\`\`\``);
        lines.push(feedback.prompt);
        lines.push(`\`\`\``);
        lines.push(``);
        lines.push(`### Findings`);
        lines.push(feedback.analysisPlaceholder);
        lines.push(``);
        lines.push(`---`);
        lines.push(``);
    }

    lines.push(`## Next Steps`);
    lines.push(``);
    lines.push(`1. Review findings from each perspective`);
    lines.push(`2. Prioritize issues by impact and effort`);
    lines.push(`3. Create tickets for actionable improvements`);
    lines.push(`4. Re-run feedback after implementing changes`);
    lines.push(``);

    const content = lines.join('\n');
    fs.writeFileSync(outputPath, content);
    return outputPath;
}

/**
 * Generate JSON report from feedback
 */
function generateJsonReport(url, screenshotInfo, feedbackResults, outputPath) {
    const report = {
        meta: {
            url,
            timestamp: new Date().toISOString(),
            toolVersion: '1.0.0',
        },
        screenshot: screenshotInfo,
        perspectives: feedbackResults.map(f => ({
            name: f.perspective,
            focusAreas: f.focusAreas,
            prompt: f.prompt,
            findings: f.analysisPlaceholder,
        })),
    };

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    return outputPath;
}

/**
 * Main orchestrator function
 */
async function runFeedbackAnalysis(url, options = {}) {
    const ts = timestamp();
    const baseOutputDir = options.output || options.o || path.join(__dirname, 'output');
    const dirs = initOutputStructure(baseOutputDir);

    log('cyan', `\n${'='.repeat(60)}`);
    log('cyan', `UI Feedback Analysis Tool`);
    log('cyan', `${'='.repeat(60)}\n`);

    // Determine viewport
    const viewportName = options.viewport || 'desktop';
    const viewport = PRESET_VIEWPORTS[viewportName] || PRESET_VIEWPORTS.desktop;

    // Step 1: Capture screenshot (or use existing)
    let screenshotInfo;
    if (options.analyze) {
        // Use existing screenshot
        const existingPath = typeof options.analyze === 'string' ? options.analyze : url;
        if (!fs.existsSync(existingPath)) {
            throw new Error(`Screenshot not found: ${existingPath}`);
        }
        screenshotInfo = {
            path: existingPath,
            absolutePath: path.resolve(existingPath),
            timestamp: new Date().toISOString(),
        };
        log('blue', `Using existing screenshot: ${existingPath}`);
    } else {
        // Capture new screenshot
        log('blue', `Step 1: Capturing screenshot...`);
        const screenshotPath = path.join(dirs.screenshots, `capture-${ts}.png`);
        screenshotInfo = await captureScreenshot(url, {
            output: screenshotPath,
            width: viewport.width,
            height: viewport.height,
            wait: options.wait || 2000,
            waitFor: options.waitFor,
        });
    }

    // Step 2: Determine which perspectives to use
    const perspectiveList = options.perspectives
        ? options.perspectives.split(',').map(p => p.trim().toLowerCase())
        : Object.keys(PERSPECTIVES);

    log('blue', `\nStep 2: Generating feedback from ${perspectiveList.length} perspectives...`);

    // Step 3: Generate feedback for each perspective
    const feedbackResults = [];
    for (const perspective of perspectiveList) {
        if (!PERSPECTIVES[perspective]) {
            log('yellow', `  Skipping unknown perspective: ${perspective}`);
            continue;
        }
        log('dim', `  - ${PERSPECTIVES[perspective].name}`);
        const feedback = generatePerspectiveFeedback(screenshotInfo.path, perspective);
        feedbackResults.push(feedback);
    }

    // Step 4: Generate reports
    log('blue', `\nStep 3: Generating reports...`);

    const format = options.format || 'both';
    const reportPaths = [];

    if (format === 'markdown' || format === 'both') {
        const mdPath = path.join(dirs.reports, `feedback-${ts}.md`);
        generateMarkdownReport(url, screenshotInfo, feedbackResults, mdPath);
        reportPaths.push(mdPath);
        log('green', `  Markdown report: ${mdPath}`);
    }

    if (format === 'json' || format === 'both') {
        const jsonPath = path.join(dirs.analysis, `feedback-${ts}.json`);
        generateJsonReport(url, screenshotInfo, feedbackResults, jsonPath);
        reportPaths.push(jsonPath);
        log('green', `  JSON report: ${jsonPath}`);
    }

    // Summary
    log('cyan', `\n${'='.repeat(60)}`);
    log('green', `Analysis complete!`);
    log('cyan', `${'='.repeat(60)}\n`);

    const result = {
        url,
        timestamp: ts,
        screenshot: screenshotInfo,
        perspectives: perspectiveList,
        reports: reportPaths,
        outputDirectory: baseOutputDir,
    };

    console.log(JSON.stringify(result, null, 2));

    return result;
}

/**
 * List recent feedback reports
 */
function listReports(outputDir) {
    const reportsDir = path.join(outputDir, OUTPUT_STRUCTURE.reports);
    if (!fs.existsSync(reportsDir)) {
        log('yellow', 'No reports directory found.');
        return [];
    }

    const files = fs.readdirSync(reportsDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse()
        .slice(0, 10);

    if (files.length === 0) {
        log('yellow', 'No reports found.');
        return [];
    }

    log('cyan', '\nRecent Feedback Reports:');
    files.forEach((f, i) => {
        log('dim', `  ${i + 1}. ${f}`);
    });

    return files.map(f => path.join(reportsDir, f));
}

/**
 * Show usage help
 */
function showHelp() {
    console.log(`
${colors.cyan}${colors.bold}UI Feedback Tool - Multi-Perspective UI Analysis${colors.reset}

Captures screenshots and generates feedback from multiple stakeholder perspectives:
  - Developer: Technical implementation quality
  - User: Usability and clarity
  - Product Owner: Business alignment and conversion
  - QA Tester: Edge cases and testing scenarios

${colors.bold}Usage:${colors.reset}
  node index.js <url> [options]
  node index.js --analyze <screenshot-path>
  node index.js --list

${colors.bold}Options:${colors.reset}
  --output, -o       Output directory (default: ./output)
  --perspectives     Comma-separated: developer,user,product,qa (default: all)
  --format           Report format: json, markdown, or both (default: both)
  --viewport         Viewport preset: desktop, laptop, tablet, mobile
  --analyze          Analyze existing screenshot instead of capturing
  --wait             Wait time before screenshot in ms (default: 2000)
  --waitFor          CSS selector to wait for before screenshot
  --list             List recent feedback reports
  --help, -h         Show this help

${colors.bold}Examples:${colors.reset}
  # Full analysis of a URL
  node index.js http://localhost:5173

  # Developer and QA perspectives only
  node index.js http://localhost:5173 --perspectives=developer,qa

  # Mobile viewport analysis
  node index.js http://localhost:5173 --viewport=mobile

  # Analyze existing screenshot
  node index.js --analyze ./screenshots/existing.png

  # Custom output directory
  node index.js http://localhost:5173 --output=./my-feedback

${colors.bold}Output Structure:${colors.reset}
  output/
    screenshots/    Captured screenshots
    reports/        Markdown feedback reports
    analysis/       JSON analysis data
    improvements/   Tracked improvements

${colors.bold}Integrating with Claude:${colors.reset}
  This tool generates prompts designed for vision-capable LLMs.
  The screenshot and perspective prompts can be sent to Claude
  for detailed analysis and actionable recommendations.
`);
}

// Main CLI handler
async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.help || args.h) {
        showHelp();
        process.exit(0);
    }

    if (args.list) {
        const outputDir = args.output || args.o || path.join(__dirname, 'output');
        listReports(outputDir);
        process.exit(0);
    }

    const url = args._[0];

    if (!url && !args.analyze) {
        showHelp();
        process.exit(1);
    }

    try {
        await runFeedbackAnalysis(url || '', args);
    } catch (error) {
        log('red', `Error: ${error.message}`);
        if (process.env.DEBUG) {
            console.error(error);
        }
        process.exit(1);
    }
}

// Export for programmatic use
module.exports = {
    runFeedbackAnalysis,
    generatePerspectiveFeedback,
    PERSPECTIVES,
    OUTPUT_STRUCTURE,
    initOutputStructure,
    listReports,
};

// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        log('red', `Fatal: ${error.message}`);
        process.exit(1);
    });
}

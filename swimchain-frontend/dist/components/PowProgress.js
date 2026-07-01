import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Proof-of-Work progress display with mining tips
 */
import { useState, useMemo } from 'react';
import './PowProgress.css';
// Local implementation of mining estimate (avoids @swimchain/react import)
function useMiningEstimate(difficulty) {
    return useMemo(() => {
        const expectedAttempts = Math.pow(2, difficulty);
        const hashRate = 50000; // Approximate hash rate
        const seconds = expectedAttempts / hashRate;
        if (seconds < 60)
            return { formatted: `~${Math.round(seconds)}s` };
        if (seconds < 3600)
            return { formatted: `~${Math.round(seconds / 60)}m` };
        return { formatted: `~${Math.round(seconds / 3600)}h` };
    }, [difficulty]);
}
const MINING_TIPS = [
    "This proof-of-work prevents spam without needing moderators.",
    "Every post costs compute, making advertising economically irrational.",
    "You're not just waiting - you're defending the network.",
    "Continue browsing while mining by opening threads in new tabs.",
    "The mining process uses your CPU to find a hash with specific properties.",
    "Once complete, your identity will be valid across the entire network.",
    "Swimchain uses Ed25519 signatures for cryptographic identity.",
    "Your private key never leaves your browser.",
];
export function PowProgress({ attempts, elapsedMs, difficulty, onCancel, }) {
    const [tip] = useState(() => MINING_TIPS[Math.floor(Math.random() * MINING_TIPS.length)]);
    const { formatted: estimatedTime } = useMiningEstimate(difficulty);
    const elapsedSeconds = elapsedMs / 1000;
    const hashRate = elapsedMs > 0 ? Math.round(attempts / (elapsedMs / 1000)) : 0;
    // Calculate progress (rough estimate based on expected attempts)
    const expectedAttempts = Math.pow(2, difficulty);
    const progressPercent = Math.min((attempts / expectedAttempts) * 100, 95);
    return (_jsxs("div", { className: "pow-progress", role: "status", "aria-live": "polite", children: [_jsx("h3", { className: "pow-title", children: "Mining Proof-of-Work" }), _jsx("div", { className: "pow-spinner", "aria-hidden": "true", children: _jsxs("div", { className: "spinner-cube", children: [_jsx("div", { className: "cube-face front" }), _jsx("div", { className: "cube-face back" }), _jsx("div", { className: "cube-face right" }), _jsx("div", { className: "cube-face left" }), _jsx("div", { className: "cube-face top" }), _jsx("div", { className: "cube-face bottom" })] }) }), _jsxs("div", { className: "pow-stats", children: [_jsxs("div", { className: "stat", children: [_jsx("span", { className: "stat-value", children: attempts.toLocaleString() }), _jsx("span", { className: "stat-label", children: "Attempts" })] }), _jsxs("div", { className: "stat", children: [_jsxs("span", { className: "stat-value", children: [elapsedSeconds.toFixed(1), "s"] }), _jsx("span", { className: "stat-label", children: "Elapsed" })] }), _jsxs("div", { className: "stat", children: [_jsx("span", { className: "stat-value", children: hashRate.toLocaleString() }), _jsx("span", { className: "stat-label", children: "Hashes/sec" })] })] }), _jsx("div", { className: "pow-progress-bar", role: "progressbar", "aria-valuenow": Math.round(progressPercent), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": `Mining progress: ${Math.round(progressPercent)}%`, children: _jsx("div", { className: "progress-fill", style: { width: `${progressPercent}%` } }) }), _jsxs("p", { className: "pow-estimate", children: ["Estimated time: ", estimatedTime] }), _jsxs("p", { className: "pow-tip", "aria-live": "polite", children: ["Did you know? ", tip] }), _jsx("button", { type: "button", className: "btn btn-secondary", onClick: onCancel, children: "Cancel Mining" })] }));
}
//# sourceMappingURL=PowProgress.js.map
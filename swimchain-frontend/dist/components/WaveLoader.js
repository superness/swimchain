import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import './WaveLoader.css';
export function WaveLoader({ size = 'medium', text, fullScreen = false, color, }) {
    const style = color ? { '--wave-color': color } : {};
    const content = (_jsxs("div", { className: `wave-loader wave-loader--${size}`, style: style, role: "status", "aria-busy": "true", "aria-label": text || "Loading", children: [_jsxs("div", { className: "wave-loader__container", "aria-hidden": "true", children: [_jsxs("div", { className: "wave-loader__waves", children: [_jsx("div", { className: "wave-loader__wave wave-loader__wave--1" }), _jsx("div", { className: "wave-loader__wave wave-loader__wave--2" }), _jsx("div", { className: "wave-loader__wave wave-loader__wave--3" })] }), _jsxs("div", { className: "wave-loader__drops", children: [_jsx("div", { className: "wave-loader__drop wave-loader__drop--1" }), _jsx("div", { className: "wave-loader__drop wave-loader__drop--2" }), _jsx("div", { className: "wave-loader__drop wave-loader__drop--3" })] })] }), text && _jsx("p", { className: "wave-loader__text", children: text })] }));
    if (fullScreen) {
        return _jsx("div", { className: "wave-loader__overlay", children: content });
    }
    return content;
}
export function PageTransition({ active, direction = 'up', onComplete, }) {
    if (!active)
        return null;
    return (_jsx("div", { className: `page-transition page-transition--${direction} ${active ? 'page-transition--active' : ''}`, onAnimationEnd: onComplete, children: _jsx("svg", { className: "page-transition__wave", viewBox: "0 0 1440 320", preserveAspectRatio: "none", children: _jsx("path", { className: "page-transition__path", d: "M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" }) }) }));
}
//# sourceMappingURL=WaveLoader.js.map
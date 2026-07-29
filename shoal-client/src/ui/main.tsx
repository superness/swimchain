/**
 * The Shoal — shell entry point.
 *
 * DISPLAY SIDE. Floats, wall-clock reads and DOM access are all fine here; nothing in
 * this directory may be imported by `src/lib/`.
 *
 * Task 1 mounted the DIAGNOSTIC panel here, because there was no game yet. Task 4
 * replaces it with the sea: `App` owns the canvas and keeps Task 1's panel reachable
 * behind F1 (or the dim corner dot), since Tasks 5-7 still need to see whether the
 * sidecar is alive. The diegetic rule (spec §1.1) is why the panel is hidden by
 * default rather than merged into the game surface — a developer screen should stay
 * unmistakably a developer screen instead of dressing the plumbing in sea language.
 */
import { createRoot } from 'react-dom/client';
import { App } from './App';
/** The window's own reset — `index.html` may not carry one inline; shell.css
 *  says at length why not. */
import './shell.css';

const host = document.getElementById('root');
if (!host) throw new Error('index.html is missing its #root element');
createRoot(host).render(<App />);

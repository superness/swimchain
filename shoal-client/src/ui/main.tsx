/**
 * The Shoal — shell entry point.
 *
 * DISPLAY SIDE. Floats, wall-clock reads and DOM access are all fine here; nothing in
 * this directory may be imported by `src/lib/`.
 *
 * Task 1 of the shell plan deliberately mounts a DIAGNOSTIC panel rather than a game.
 * The game surfaces land in Tasks 4-6; inventing player copy here would only have to be
 * deleted, and the diegetic rule (spec §1.1) is easier to hold if the developer-facing
 * screen never pretends to be a player-facing one.
 */
import { createRoot } from 'react-dom/client';
import { Diagnostics } from './Diagnostics';

const host = document.getElementById('root');
if (!host) throw new Error('index.html is missing its #root element');
createRoot(host).render(<Diagnostics />);

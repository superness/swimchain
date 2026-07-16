/**
 * resolveUnresolvedAppSpaces — the wiki's self-sufficient space discovery.
 * Run: npx tsx src/lib/resolveSpaces.test.ts
 */
import { resolveUnresolvedAppSpaces } from './resolveSpaces';

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`  ${cond ? 'ok ' : 'FAIL'} ${name}`);
  if (!cond) failures += 1;
}

const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
const rpc = {
  call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    calls.push({ method, params });
    return Promise.resolve({} as T);
  },
};

const spaces = [
  { space_id: 'sp1_wiki_unresolved', class: 'app', app: null, name: null, name_unresolved: true },
  { space_id: 'sp1_wiki_resolved', class: 'app', app: 'wiki', name: 'Minecraft', name_unresolved: false },
  { space_id: 'sp1_social', class: 'social', app: null, name: null, name_unresolved: true }, // not app-class
  { space_id: 'sp1_chess_unresolved', class: 'app', app: null, name: null },
];

// Fires exactly for unresolved APP-class spaces.
const fired = resolveUnresolvedAppSpaces(rpc, spaces);
check('reports queries fired', fired === true);
check('queried both unresolved app spaces', calls.length === 2);
check(
  'queried the right ids',
  calls.every(c => c.method === 'resolve_space_name') &&
    new Set(calls.map(c => c.params.space_id)).size === 2 &&
    calls.some(c => c.params.space_id === 'sp1_wiki_unresolved') &&
    calls.some(c => c.params.space_id === 'sp1_chess_unresolved')
);
check('never queried resolved or non-app spaces', !calls.some(c =>
  c.params.space_id === 'sp1_wiki_resolved' || c.params.space_id === 'sp1_social'));

// Session dedup: a second sweep with the same spaces fires nothing.
calls.length = 0;
const firedAgain = resolveUnresolvedAppSpaces(rpc, spaces);
check('second sweep is a no-op (per-session dedup)', firedAgain === false && calls.length === 0);

// Fully-resolved list: no-op from the start.
calls.length = 0;
const resolvedOnly = [
  { space_id: 'sp1_other_resolved', class: 'app', app: 'wiki', name: 'Docs', name_unresolved: false },
];
const firedResolved = resolveUnresolvedAppSpaces(rpc, resolvedOnly);
check('fully-resolved list fires nothing', firedResolved === false && calls.length === 0);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

/**
 * The proof key must DETERMINE the value it keys — it is the identity of one
 * Argon2id input. Run: npx tsx src/lib/proofKey.test.ts
 */
import { proofKey } from './proofKey';
import { MAX_BATCH } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const T = 'sha256:table', A = 'a'.repeat(64);

check('same inputs, same key', proofKey(T, A, 5, 7n) === proofKey(T, A, 5, 7n));
check('table matters', proofKey(T, A, 5, 7n) !== proofKey('sha256:other', A, 5, 7n));
check('author matters', proofKey(T, A, 5, 7n) !== proofKey(T, 'b'.repeat(64), 5, 7n));
check('ms matters', proofKey(T, A, 5, 7n) !== proofKey(T, A, 6, 7n));
check('nonce matters', proofKey(T, A, 5, 7n) !== proofKey(T, A, 5, 8n));

// Author casing must not split one identity into two cache entries.
check('author case-insensitive', proofKey(T, A.toUpperCase(), 5, 7n) === proofKey(T, A, 5, 7n));

// The separator must not let one field impersonate another, whatever the
// fields contain. Inject the REAL delimiter into both variable-length fields —
// a test that injects some other character proves nothing about this one.
check('table cannot borrow the author boundary',
  proofKey('X|y', 'z', 5, 7n) !== proofKey('X', 'y|z', 5, 7n));
check('author cannot borrow the ms boundary',
  proofKey(T, `${A}|5`, 0, 7n) !== proofKey(T, A, 5, 7n));

check('MAX_BATCH is 24', MAX_BATCH === 24);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

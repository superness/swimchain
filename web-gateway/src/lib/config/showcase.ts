/**
 * Browse showcase lockdown.
 *
 * The public browse gateway can be restricted to a curated set of spaces and
 * authors so swimchain.io/browse presents a controlled showcase rather than the
 * whole network. When a list is empty the corresponding filter is a no-op (full
 * browse). Configure via env; the baked defaults lock browse to the "Swimchain
 * 101" space and the operator's identity.
 *
 *   SHOWCASE_SPACE_IDS   comma-separated sp1… space ids to allow (else: all)
 *   SHOWCASE_AUTHOR_IDS  comma-separated cs1… (or hex) authors to allow (else: all)
 */

import { addressToHex, hexToAddress } from '@/lib/address';

// Curated spaces: Swimchain 101, and The Daily Drift (the newspaper demo at
// /example, whose "gateway view" links point back into /browse).
const DEFAULT_SPACE_IDS =
  'sp1qqqsqrug2lxh0f6a3lxhj5wenm0qkf4vcm,sp1qqqsqrdfg94sh5e3zjs3yd9p897szsthzr';
const DEFAULT_AUTHOR_IDS =
  'cs1qqyapas5tz23d30w39pwnxs93prnrfz6n667fgucq2k77n7trwvpxrh9sxj,' + // operator (101)
  'cs1qzknh7xvkxx3w65ed8c3atsa3aj6l5jggy9d7adu7c545u07y6j7qxn60ga'; // dispatch-bot (Daily Drift)
// spaceId=Display Name pairs, so a curated space shows a real title even when the
// node has never resolved its on-chain name (the name blob may not be seeded on
// any peer). Override with SHOWCASE_SPACE_NAMES="sp1..=Name,sp1..=Name".
const DEFAULT_SPACE_NAMES =
  'sp1qqqsqrug2lxh0f6a3lxhj5wenm0qkf4vcm=Swimchain 101,' +
  'sp1qqqsqrdfg94sh5e3zjs3yd9p897szsthzr=The Daily Drift';

function parseList(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

const spaceIds = new Set(parseList(process.env.SHOWCASE_SPACE_IDS, DEFAULT_SPACE_IDS));

const spaceNames = new Map<string, string>();
for (const pair of parseList(process.env.SHOWCASE_SPACE_NAMES, DEFAULT_SPACE_NAMES)) {
  const eq = pair.indexOf('=');
  if (eq > 0) spaceNames.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
}

// An author id reaches us as a cs1 address from some RPCs and as raw hex from
// others, so index every equivalent form for O(1), representation-agnostic tests.
const authorForms = new Set<string>();
for (const a of parseList(process.env.SHOWCASE_AUTHOR_IDS, DEFAULT_AUTHOR_IDS)) {
  const lower = a.toLowerCase();
  authorForms.add(lower);
  const hex = addressToHex(a);
  if (hex) authorForms.add(hex.toLowerCase());
  const addr = hexToAddress(a);
  if (addr) authorForms.add(addr.toLowerCase());
}

/** True if the space directory should surface this space (empty allowlist = all). */
export function isShowcaseSpace(spaceId: string): boolean {
  return spaceIds.size === 0 || spaceIds.has(spaceId);
}

/**
 * True if this space is *explicitly* curated (a non-empty allowlist contains it).
 * A curated space is trusted: the gateway shows it even if the node hasn't
 * resolved its name or classified it, because inclusion is a deliberate choice.
 * (When no allowlist is configured this is always false — normal browse rules
 * still apply to every space.)
 */
export function isCuratedShowcaseSpace(spaceId: string): boolean {
  return spaceIds.size > 0 && spaceIds.has(spaceId);
}

/** Configured display name for a curated space, if any. */
export function showcaseSpaceName(spaceId: string): string | undefined {
  return spaceNames.get(spaceId);
}

/** True if this author's content may be shown (empty allowlist = all). */
export function isShowcaseAuthor(authorId: string): boolean {
  if (authorForms.size === 0) return true;
  if (authorForms.has(authorId.toLowerCase())) return true;
  const hex = addressToHex(authorId);
  if (hex && authorForms.has(hex.toLowerCase())) return true;
  const addr = hexToAddress(authorId);
  if (addr && authorForms.has(addr.toLowerCase())) return true;
  return false;
}

/**
 * The water — one name, one space, one room per hour, and the pair of rooms a
 * fold reads. Run: npx tsx src/lib/water.test.ts
 *
 * TWO CLAIMS, AND BOTH ARE THE SAME CLASS OF DEFECT: silent, symptomless, and
 * permanent.
 *
 *  1. **The binding.** Task 1's review: *"nothing binds the water name passed
 *     to `roomIdFor` to the space actually written into"*. Two correct
 *     derivations from one string, in two modules, with nothing joining them —
 *     so a caller could hold a room of one water and the space of another and
 *     every write would be accepted, every read would answer, and the sea would
 *     be shared with nobody.
 *  2. **The crossing.** A fold of epoch *E* reaches 180 s BEFORE the hour, all
 *     of which now lives in a different post. A client that read one room would
 *     fold a sea missing three minutes of history and could not tell — the fold
 *     has no way to notice a missing prefix.
 *
 * Everything below is checked against arithmetic spelled out here rather than
 * against the module's own answer, and the space id is recomputed with
 * **node:crypto** — a different SHA-256 implementation from the `hash-wasm` one
 * `waterNamed` uses. Two implementations agreeing is evidence; one agreeing
 * with itself is not.
 */
import { createHash } from 'node:crypto';

import { EPOCH_MS, PRESENCE_TTL_MS, WARMUP_MS } from './shoalConst';
import { epochStartMs, epochWarmStartMs } from './epoch';
import { admitFloorMs } from './shoalLoop';
import { encodeWireSpaceId } from './shoalRpc';
import { roomPreimage } from './shoalRoom';
import {
  WATER_APP, assertWaterName, roomEpochsFor, roomFamilyKey, roomIdIn, roomTextIn, verifyWater,
  waterNamed, type Water,
} from './water';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/** The space id `create_space` derives for an app space, spelled out by hand:
 *  `apply_class(App, sha256("app:<app>:v1:<display>"))` — the class byte, then
 *  the first 15 bytes of the digest (src/types/space_class.rs:70-73) — wrapped
 *  bech32m by `encode_space_id` (src/rpc/methods.rs:186-194). */
function handSpaceId(app: string, name: string): string {
  const digest = createHash('sha256').update(`app:${app}:v1:${name}`, 'utf8').digest();
  const id16 = new Uint8Array(16);
  id16[0] = 0x05; // SpaceClass::App
  id16.set(digest.subarray(0, 15), 1);
  return encodeWireSpaceId(id16);
}

// ===========================================================================
// 1. ONE NAME, BOTH DERIVATIONS
// ===========================================================================
{
  console.log('\n1. a water is one name, and everything it determines');

  const main = await waterNamed('main');

  // ── THE BRAND, PINNED AS A COMPILE ERROR ────────────────────────────────
  //
  // This is a TYPE-LEVEL test and it runs as part of `npm test`, because that
  // script is `tsc --noEmit` twice before it is `tsx` anything. The
  // `@ts-expect-error` directive asserts that the line below DOES NOT COMPILE:
  // if the brand is removed from `Water`, the line starts compiling and tsc
  // fails with "Unused '@ts-expect-error' directive". So the check cannot pass
  // vacuously — it fails in both directions.
  //
  // What it forbids is the exact object round 1's review built and got past the
  // suite: a water whose `name` and `spaceId` have nothing to do with each
  // other. Note the `spaceId` here is `smoke`'s, under the name `main` — a
  // client holding this would derive `main`'s rooms and write them into
  // `smoke`'s space, be accepted, read back, and share the sea with nobody.
  {
    const elsewhere = await waterNamed('smoke');
    // @ts-expect-error a hand-built Water is a compile error — `waterBrand` is
    // a `declare const unique symbol` that no module outside water.ts can name.
    const forged: Water = {
      name: 'main', app: 'shoal', spaceName: '@shoal:main', spaceId: elsewhere.spaceId,
    };
    check('COMPILE-TIME: a hand-built `Water` does not type-check (see the directive above)',
      // Reading a field keeps `noUnusedLocals` quiet; the assertion is the
      // directive, not this expression.
      typeof forged.spaceId === 'string');
    // ...and the honest way round costs one call and cannot be wrong.
    const real = await waterNamed('main');
    check('...while the one legal constructor produces one that does',
      real.name === 'main' && real.spaceId !== elsewhere.spaceId, real.spaceId);
  }

  check('the display name is carried as given', main.name === 'main', main.name);
  check('the app namespace is the frozen `shoal`',
    main.app === 'shoal' && WATER_APP === 'shoal', { app: main.app, WATER_APP });
  check('the create_space form carries the marker', main.spaceName === '@shoal:main', main.spaceName);
  check('the space id is the node\'s bech32m wire form',
    /^sp1[023456789acdefghjklmnpqrstuvwxyz]{34}$/.test(main.spaceId), main.spaceId);

  // SECOND IMPLEMENTATION, over a preimage spelled out here rather than taken
  // from the module.
  check('node:crypto derives the same space id from the same one string',
    main.spaceId === handSpaceId('shoal', 'main'), main.spaceId);

  // THE BINDING ITSELF: the space is a function of the water's OWN name, read
  // back out of the water rather than compared against the constant that was
  // passed in. A `waterNamed` that returned one name beside another name's
  // space would pass a check against `'main'` and fail this one.
  for (const n of ['main', 'smoke', 'two', 'cp', 'deep-blue-2']) {
    const w = await waterNamed(n);
    check(`\`${n}\`: the space id follows the name the water reports`,
      w.spaceId === handSpaceId(w.app, w.name) && w.name === n, { name: w.name, spaceId: w.spaceId });
  }

  // NON-DEGENERACY: the recipe discriminates, so the equalities above are not
  // satisfied by any two constants that happen to agree.
  check('NON-DEGENERACY: five waters give five distinct spaces',
    new Set(await Promise.all(
      ['main', 'smoke', 'two', 'cp', 'deep-blue-2'].map(async (n) => (await waterNamed(n)).spaceId),
    )).size === 5);
  check('NON-DEGENERACY: another app namespace gives another space',
    main.spaceId !== handSpaceId('wiki', 'main'));

  // AND THE ROOM CARRIES THE SAME NAME. The room body is
  // `room:shoal:v1:<name>:<epoch>`, so the name is read back OUT of the room
  // and required to be the one the space was derived from — the two halves of
  // the binding, joined, rather than each checked against a literal.
  const body = roomTextIn(main, 495_936).body;
  const nameInRoom = body.split(':')[3];
  check('the name inside the room body is the name that derived the space',
    nameInRoom === main.name && main.spaceId === handSpaceId(main.app, nameInRoom),
    { nameInRoom, body });
  check('...and the room id is sha256 of the preimage `submit_post` hashes',
    (await roomIdIn(main, 495_936)) === 'sha256:' + createHash('sha256')
      .update('The Shoal\n\nroom:shoal:v1:main:495936', 'utf8').digest('hex'),
    await roomIdIn(main, 495_936));
  check('...which is exactly `roomPreimage` of the room text',
    roomPreimage(roomTextIn(main, 495_936)) === 'The Shoal\n\nroom:shoal:v1:main:495936',
    roomPreimage(roomTextIn(main, 495_936)));

  // Every hour of this water names this water.
  let allNamed = true;
  for (let e = 495_900; e < 495_960; e++) {
    if (roomTextIn(main, e).body !== `room:shoal:v1:main:${e}`) allNamed = false;
  }
  check('sixty consecutive hours all name this water and no other', allNamed);
}

// ===========================================================================
// 2. THE NAME GRAMMAR IS AN ALLOWLIST
//
// The exhaustive case list lives in shoalRoom.test.ts, next to the pinned room
// literals it protects. What is checked HERE is that `water.ts` applies the
// SAME rule to the SAME string — one grammar, one definition. A `waterNamed`
// with a guard of its own would let a name mint a space that no room could ever
// belong to, or the reverse.
// ===========================================================================
{
  console.log('\n2. one grammar, applied to both derivations');

  const rejected = async (name: unknown): Promise<boolean> => {
    try { await waterNamed(name as string); return false; } catch { return true; }
  };
  const alsoRejectedByTheRoomGuard = (name: unknown): boolean => {
    try { assertWaterName(name); return false; } catch { return true; }
  };

  const bad: unknown[] = [
    '', '@shoal:main', 'ma\nin', 'main ', ' main', 'ma in', 'main\r', 'main\t',
    'main\0', 'Main', 'máin', 'máin', 'ma‍in', '-main', 'main-',
    'ma--in', 'a'.repeat(33), ['main:x'], 123, null, undefined,
  ];
  let allRefused = true;
  let allAgreed = true;
  const survivors: unknown[] = [];
  for (const b of bad) {
    if (!(await rejected(b))) { allRefused = false; survivors.push(b); }
    if (alsoRejectedByTheRoomGuard(b) !== true) allAgreed = false;
  }
  check('every near-miss is refused by `waterNamed`', allRefused, survivors);
  check('...and by the guard the ROOM body goes through — one rule, not two', allAgreed);

  check('the four waters this game uses are all accepted',
    !(await rejected('main')) && !(await rejected('smoke'))
    && !(await rejected('two')) && !(await rejected('cp')));
}

// ===========================================================================
// 3. THE CROSSING — the pair of rooms, and why it is a pair
// ===========================================================================
{
  console.log('\n3. a fold of epoch E reads epoch E-1 and epoch E');

  const E = 495_936;
  const pair = roomEpochsFor(E);
  check('exactly two rooms', pair.length === 2, pair);
  check('the older one first: E-1, then E', pair[0] === E - 1 && pair[1] === E, pair);

  // WHY TWO — spelled out in arithmetic rather than argued, from the consensus
  // constants themselves.
  const start = epochStartMs(E);
  check('the fold does not start at the hour: it starts WARMUP_MS before it',
    epochWarmStartMs(E) === start - WARMUP_MS && WARMUP_MS === 90_000,
    { warmStart: epochWarmStartMs(E), start, WARMUP_MS });
  check('and its entry cursor reaches PRESENCE_TTL_MS before THAT — 180 s in all',
    admitFloorMs(E) === start - WARMUP_MS - PRESENCE_TTL_MS
    && admitFloorMs(E) === start - 180_000,
    { floor: admitFloorMs(E), start });
  check('THE FLOOR LANDS INSIDE EPOCH E-1, which is why one room is not enough',
    admitFloorMs(E) < epochStartMs(E) && admitFloorMs(E) >= epochStartMs(E - 1),
    { floor: admitFloorMs(E), prevStart: epochStartMs(E - 1) });
  check('...and NEVER reaches epoch E-2, which is why two rooms are enough',
    admitFloorMs(E) > epochStartMs(E - 2) && 180_000 < EPOCH_MS,
    { floor: admitFloorMs(E), twoBackStart: epochStartMs(E - 2), EPOCH_MS });

  // THE FLOOR DOES NOT MOVE WITHIN AN EPOCH. It is a function of the epoch, not
  // of the current instant, so a client at 00:05 needs the previous room
  // exactly as much as one at 00:00:30 — which is the answer to "when can it
  // stop reading the old one": when it rolls, and not before.
  // WAS `admitFloorMs(E) === admitFloorMs(E)`, which is true of every unary
  // function ever written and was proved vacuous by moving the floor 123456 ms
  // — the twentieth vacuous check across eleven plans. What it MEANT to say is
  // that the floor tracks the epoch grid and nothing else, and that is a claim
  // with content: it moves forward by exactly one epoch per epoch, so it cannot
  // creep within one. (Its absolute position is pinned two checks above, which
  // is what a shifted floor fails.)
  check('the floor moves forward by exactly one EPOCH_MS per epoch, so it never creeps within one',
    admitFloorMs(E + 1) - admitFloorMs(E) === EPOCH_MS
    && admitFloorMs(E) - admitFloorMs(E - 1) === EPOCH_MS
    && admitFloorMs(E) === epochStartMs(E) - 180_000,
    { deltaUp: admitFloorMs(E + 1) - admitFloorMs(E), EPOCH_MS });
  check('...so the pair for E is the same at every instant inside E, and only '
    + 'changes when the fold rolls to E+1',
    roomEpochsFor(E)[0] === E - 1 && roomEpochsFor(E + 1)[0] === E
    && roomEpochsFor(E + 1)[1] === E + 1,
    { atE: roomEpochsFor(E), atNext: roomEpochsFor(E + 1) });

  // The pairs of consecutive epochs OVERLAP by exactly one room, which is what
  // makes a client that rolls keep the room it needs and drop only the one it
  // provably cannot.
  const a = roomEpochsFor(E);
  const b = roomEpochsFor(E + 1);
  check('consecutive pairs overlap in exactly one room',
    a.filter((e) => b.includes(e)).length === 1 && a[1] === b[0], { a, b });

  // Below zero and around zero, because the grid is absolute and floors.
  check('the pair is well defined below zero', roomEpochsFor(0)[0] === -1 && roomEpochsFor(-1)[0] === -2,
    [roomEpochsFor(0), roomEpochsFor(-1)]);
  let threw = false;
  try { roomEpochsFor(1.5); } catch { threw = true; }
  check('a fractional epoch is refused rather than spelling half a room', threw);
}

// ===========================================================================
// 4. THE WILD SHOAL DOES NOT KNOW THE SEA HAS HOURS
//
// Spec §1.1's diegetic rule, and this plan's binding constraint: a room
// rotation must be INVISIBLE to the player. The wild seed used to be the room's
// own content id, which with a room per hour would re-roll every ambient fish
// on the stroke of the hour, in front of them.
// ===========================================================================
{
  console.log('\n4. the wild shoal is a property of the water, not of the hour');

  const main = await waterNamed('main');
  const smoke = await waterNamed('smoke');

  check('the family key names the water and carries no epoch',
    roomFamilyKey(main) === 'wild:shoal:v1:main'
    // The `1` in `v1` is the grammar version, not an hour: no epoch-shaped run
    // of digits may appear, and the key must be identical for every hour.
    && !/\d{2,}/.test(roomFamilyKey(main)),
    roomFamilyKey(main));
  check('two waters are two families — a different water is still a different sea',
    roomFamilyKey(main) !== roomFamilyKey(smoke),
    [roomFamilyKey(main), roomFamilyKey(smoke)]);

  // NON-DEGENERACY: the rooms it is NOT derived from really do differ, so
  // "constant across hours" is a property of the key and not of the input.
  const rooms = await Promise.all([495_935, 495_936, 495_937].map((e) => roomIdIn(main, e)));
  check('NON-DEGENERACY: three consecutive hours are three distinct rooms',
    new Set(rooms).size === 3, rooms);

  // It is deliberately NOT the room grammar's tag: this names a different kind
  // of thing, and sharing the tag would invite someone to "keep them in step"
  // one day by adding the epoch back.
  check('the family key is its own frozen tag, not the room grammar\'s',
    !roomFamilyKey(main).startsWith('room:'), roomFamilyKey(main));
}


// ===========================================================================
// 5. `verifyWater` — the defence the brand is not
//
// The brand stops an object literal. It stops nothing that has passed through
// an `any`, and the whole-branch review demonstrated four such routes plus a
// spread, `tsc` exit 0 on every one, producing a water that derives `main`'s
// rooms against `smoke`'s space. `waterBrand`'s header states that limit
// honestly; this is what actually holds the line, and it holds it at runtime,
// where the type system is not.
//
// All five forgeries are built HERE, the same way the review built them, and
// every one must be refused. A test that checked only the literal would be
// testing the thing that already fails to compile.
// ===========================================================================
{
  console.log('\n5. a water whose space did not come from its own name is refused');

  const real = await waterNamed('main');
  const smoke = await waterNamed('smoke');

  const refused = async (w: Water): Promise<boolean> => {
    try { await verifyWater(w); return false; } catch { return true; }
  };

  // NON-DEGENERACY FIRST: an honest water passes, or "everything is refused"
  // would satisfy every check below.
  check('NON-DEGENERACY: a water from `waterNamed` is accepted', !(await refused(real)));
  check('NON-DEGENERACY: ...and so is every other one', !(await refused(smoke)));

  // 1. JSON.parse — the classic `any`.
  const viaJson: Water = JSON.parse(JSON.stringify({ ...real, spaceId: smoke.spaceId }));
  check('a water round-tripped through JSON.parse with another space is refused',
    await refused(viaJson), viaJson.spaceId);

  // 2. Any other `any` — config, IPC, an untyped RPC result.
  const fromIpc = { ...real, spaceId: smoke.spaceId } as unknown as { x: unknown };
  const viaAny: Water = (fromIpc as unknown) as Water;
  check('a water arriving as an untyped value from IPC or config is refused',
    await refused(viaAny));

  // 3. structuredClone + Object.assign — carries the brand, changes the space.
  const viaClone: Water = Object.assign(structuredClone(real) as Water, { spaceId: smoke.spaceId });
  check('a structuredClone with the space swapped is refused', await refused(viaClone));

  // 4. A generic helper — `T` is indistinguishable from a real one at the type
  //    level, so no brand can ever see this coming.
  function patch<T>(base: T, over: Partial<T>): T { return { ...base, ...over }; }
  check('a water through a generic patch<T> helper is refused',
    await refused(patch(real, { spaceId: smoke.spaceId })));

  // 5. A plain SPREAD, which the brand explicitly does not cover.
  check('a spread of a real water with the NAME swapped is refused',
    await refused({ ...real, name: 'smoke', spaceName: '@shoal:smoke' }));
  check('...and with the SPACE swapped', await refused({ ...real, spaceId: smoke.spaceId }));

  // THE FORGERY IS THE ONE THAT MATTERS, spelled out: it derives `main`'s room
  // for a real hour while its writes would go to `smoke`'s space. Both halves
  // are asserted, so this is the actual fork rather than a stand-in for it.
  check('THE FORK, named: the forged water derives main\'s room against smoke\'s space',
    (await roomIdIn(viaJson, 495_936)) === (await roomIdIn(real, 495_936))
    && viaJson.spaceId === smoke.spaceId && viaJson.spaceId !== real.spaceId,
    { room: (await roomIdIn(viaJson, 495_936)).slice(0, 20), space: viaJson.spaceId });
  check('...and that is exactly what `verifyWater` refuses', await refused(viaJson));

  // The app/spaceName halves are checked too, so a forgery that got the space
  // id right and the marker wrong does not slip through.
  check('a water whose spaceName does not match its name is refused',
    await refused({ ...real, spaceName: '@shoal:smoke' }));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

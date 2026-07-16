// reef-client/src/lib/reefEngine.ts
var REEF_SPACE = import.meta.env?.VITE_REEF_SPACE?.trim() || "";
var GAME_SPONSOR = import.meta.env?.VITE_GAME_SPONSOR?.trim() || "9ec9661d3a975ad141caa5df9f14b3c46cf725509e7fa044c19d26fe76bd0420";
var GRID_W = 12;
var GRID_H = 12;
var MAX_VITALITY = 6;
var EPOCH_MOVES = 8;
var CONTEST_DAMAGE = 2;
var CAPTURE_VITALITY = 1;
var START_BUDGET = 8;
var MAX_BUDGET = 14;
var COST_GROW = 2;
var COST_CONTEST = 3;
var REGEN_BASE = 2;
var TEND_CAP = 4;
var SEASON_EPOCHS = 5;
var CONFIRM_DEPTH = 2;
var cellKey = (x, y) => `${x},${y}`;
function inBounds(x, y, w, h) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < w && y < h;
}
var ORTHO = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0]
];
function hasAdjacentOwnedBy(cells, isOwner, x, y) {
  for (const [dx, dy] of ORTHO) {
    const c = cells.get(cellKey(x + dx, y + dy));
    if (c && isOwner(c.owner)) return true;
  }
  return false;
}
function ownsAnyCell(cells, isOwner) {
  for (const c of cells.values()) if (isOwner(c.owner)) return true;
  return false;
}
function costOf(kind) {
  switch (kind) {
    case "seed":
    case "spread":
      return COST_GROW;
    case "tend":
      return 0;
    // tend is capped, not priced
    case "contest":
      return COST_CONTEST;
  }
}
function classify(cells, header, isOwner, op, x, y) {
  if (!inBounds(x, y, header.w, header.h)) return null;
  const cell = cells.get(cellKey(x, y));
  if (op === "tend") {
    if (cell && isOwner(cell.owner)) return { kind: "tend", cost: 0 };
    return null;
  }
  if (!cell) {
    if (!ownsAnyCell(cells, isOwner)) return { kind: "seed", cost: costOf("seed") };
    if (hasAdjacentOwnedBy(cells, isOwner, x, y)) return { kind: "spread", cost: costOf("spread") };
    return null;
  }
  if (isOwner(cell.owner)) return { kind: "tend", cost: 0 };
  if (hasAdjacentOwnedBy(cells, isOwner, x, y)) return { kind: "contest", cost: COST_CONTEST };
  return null;
}
function mutate(cells, author, kind, x, y) {
  const k = cellKey(x, y);
  if (kind === "seed" || kind === "spread") {
    cells.set(k, { owner: author, vitality: MAX_VITALITY });
    return;
  }
  if (kind === "tend") {
    const c2 = cells.get(k);
    if (c2) c2.vitality = MAX_VITALITY;
    return;
  }
  const c = cells.get(k);
  if (!c) return;
  c.vitality -= CONTEST_DAMAGE;
  if (c.vitality <= 0) {
    c.owner = author;
    c.vitality = CAPTURE_VITALITY;
  }
}
function epochTick(cells) {
  for (const [k, c] of cells) {
    c.vitality -= 1;
    if (c.vitality <= 0) cells.delete(k);
  }
}
function livingByOwner(cells) {
  const m = /* @__PURE__ */ new Map();
  for (const c of cells.values()) {
    const e = m.get(c.owner) ?? { cells: 0, vitality: 0 };
    e.cells += 1;
    e.vitality += c.vitality;
    m.set(c.owner, e);
  }
  return m;
}
function parseMove(body) {
  if (!body) return null;
  const t = body.trim().split(/\s+/);
  const op = t[0];
  if (op !== "grow" && op !== "tend") return null;
  const x = Number(t[1]);
  const y = Number(t[2]);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { op, x, y };
}
function parseRetune(body) {
  if (!body) return null;
  const t = body.trim().split(/\s+/);
  if (t[0] !== "retune") return null;
  const out = {};
  for (const tok of t.slice(1)) {
    const m = /^(epochMoves|tendCap)=(\d+)$/.exec(tok);
    if (!m) continue;
    const n = Number(m[2]);
    if (m[1] === "epochMoves") out.epochMoves = Math.min(64, Math.max(2, n));
    else out.tendCap = Math.min(12, Math.max(1, n));
  }
  return out.epochMoves !== void 0 || out.tendCap !== void 0 ? out : null;
}
function authorSeqOf(body) {
  if (!body) return void 0;
  const m = /#(\d+)~/.exec(body);
  if (!m) return void 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : void 0;
}
function seqCmp(a, b) {
  const sa = authorSeqOf(a.body);
  const sb = authorSeqOf(b.body);
  return sa !== void 0 && sb !== void 0 ? sa - sb : 0;
}
function foldReef(header, replies, tipHeight) {
  const cells = /* @__PURE__ */ new Map();
  const budgets = /* @__PURE__ */ new Map();
  let tendsUsed = /* @__PURE__ */ new Map();
  let seasonPoints = /* @__PURE__ */ new Map();
  const seasons = [];
  const peak = /* @__PURE__ */ new Map();
  const conquests = /* @__PURE__ */ new Map();
  const moves = [];
  const claimedAt = /* @__PURE__ */ new Map();
  const PENDING_HEIGHT = Number.MAX_SAFE_INTEGER;
  let curHeight = 0;
  let epoch = 0;
  const params = { epochMoves: EPOCH_MOVES, tendCap: TEND_CAP };
  let justCrowned = null;
  let lastTide = null;
  const confirmed = replies.filter((r) => typeof r.block_height === "number").sort(
    (a, b) => a.block_height - b.block_height || a.created_at - b.created_at || seqCmp(a, b) || a.content_id.localeCompare(b.content_id)
  );
  const pending = replies.filter((r) => typeof r.block_height !== "number").sort((a, b) => seqCmp(a, b) || a.created_at - b.created_at || a.content_id.localeCompare(b.content_id));
  const updatePeaks = () => {
    for (const [o, e] of livingByOwner(cells)) peak.set(o, Math.max(peak.get(o) ?? 0, e.cells));
  };
  const tickEpoch = (provisional = false) => {
    const before = livingByOwner(cells);
    let beforeCells = 0;
    for (const l of before.values()) beforeCells += l.cells;
    epochTick(cells);
    const living2 = livingByOwner(cells);
    let afterCells = 0;
    for (const l of living2.values()) afterCells += l.cells;
    for (const [owner, cur] of budgets) {
      budgets.set(
        owner,
        Math.min(MAX_BUDGET, cur + REGEN_BASE + Math.floor((living2.get(owner)?.cells ?? 0) / 2))
      );
    }
    for (const [owner, l] of living2) seasonPoints.set(owner, (seasonPoints.get(owner) ?? 0) + l.vitality);
    tendsUsed = /* @__PURE__ */ new Map();
    epoch += 1;
    let crownedThisTick = null;
    if (!provisional && epoch % SEASON_EPOCHS === 0) {
      let winner = null;
      let best = -1;
      for (const [owner, pts] of [...seasonPoints].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (pts > best) {
          best = pts;
          winner = owner;
        }
      }
      justCrowned = { index: epoch / SEASON_EPOCHS - 1, winner, points: Math.max(0, best) };
      crownedThisTick = justCrowned;
      seasons.push(justCrowned);
      seasonPoints = /* @__PURE__ */ new Map();
    }
    updatePeaks();
    const byOwner = /* @__PURE__ */ new Map();
    for (const owner of /* @__PURE__ */ new Set([...before.keys(), ...living2.keys()])) {
      const b = before.get(owner);
      const a = living2.get(owner);
      byOwner.set(owner, {
        territoryBefore: b?.cells ?? 0,
        territoryAfter: a?.cells ?? 0,
        vitalityBefore: b?.vitality ?? 0,
        vitalityAfter: a?.vitality ?? 0,
        pointsBanked: a?.vitality ?? 0,
        seasonPointsAfter: seasonPoints.get(owner) ?? 0
        // 0 if the season just reset
      });
    }
    lastTide = {
      epoch,
      decayedGlobal: Math.max(0, beforeCells - afterCells),
      survivorsGlobal: afterCells,
      crownedSeason: crownedThisTick,
      byOwner
    };
  };
  const applyOne = (r, p) => {
    const author = r.author_id;
    if (!budgets.has(author)) budgets.set(author, START_BUDGET);
    const key = cellKey(p.x, p.y);
    const isAuthor = (owner) => owner === author;
    const target = cells.get(key);
    if (p.op === "grow" && target && target.owner !== author && claimedAt.get(key) === curHeight) {
      moves.push({ ...p, author, contentId: r.content_id, ok: false, outcome: "tie-lost" });
      return;
    }
    const cls = classify(cells, header, isAuthor, p.op, p.x, p.y);
    let ok = false;
    let outcome;
    if (!cls) {
      outcome = "rejected-invalid";
    } else if (cls.kind === "tend") {
      const used = tendsUsed.get(author) ?? 0;
      if (used < params.tendCap) {
        mutate(cells, author, "tend", p.x, p.y);
        tendsUsed.set(author, used + 1);
        ok = true;
        outcome = "tended";
      } else {
        outcome = "rejected-capped";
      }
    } else {
      const have = budgets.get(author);
      if (have >= cls.cost) {
        const prevOwner = cls.kind === "contest" ? cells.get(key)?.owner : void 0;
        mutate(cells, author, cls.kind, p.x, p.y);
        budgets.set(author, have - cls.cost);
        ok = true;
        const now = cells.get(key);
        if (cls.kind === "contest") {
          if (now?.owner === author) {
            outcome = "captured";
            if (prevOwner && prevOwner !== author) {
              conquests.set(author, (conquests.get(author) ?? 0) + 1);
            }
          } else {
            outcome = "contested";
          }
        } else {
          outcome = "grew";
        }
        if (now?.owner === author) claimedAt.set(key, curHeight);
      } else {
        outcome = "rejected-unaffordable";
      }
    }
    moves.push({ ...p, author, contentId: r.content_id, ok, outcome });
    if (ok) updatePeaks();
  };
  const applyRetune = (r, tune) => {
    const isFounder = r.author_id === header.founder;
    if (isFounder) Object.assign(params, tune);
    moves.push({
      op: "tend",
      // placeholder op for the AppliedMove shape; never renders as coral
      x: -1,
      y: -1,
      author: r.author_id,
      contentId: r.content_id,
      ok: isFounder,
      outcome: isFounder ? "retuned" : "rejected-not-founder"
    });
  };
  let sinceTide = 0;
  for (const r of confirmed) {
    const tune = parseRetune(r.body);
    if (tune) {
      curHeight = r.block_height;
      applyRetune(r, tune);
      continue;
    }
    const p = parseMove(r.body);
    if (!p) continue;
    curHeight = r.block_height;
    applyOne(r, p);
    sinceTide += 1;
    if (sinceTide >= params.epochMoves) {
      tickEpoch();
      sinceTide = 0;
    }
  }
  const confirmedEpoch = epoch;
  let tentative = 0;
  curHeight = PENDING_HEIGHT;
  for (const r of pending) {
    const tune = parseRetune(r.body);
    if (tune) {
      applyRetune(r, tune);
      continue;
    }
    const p = parseMove(r.body);
    if (!p) continue;
    tentative += 1;
    applyOne(r, p);
    sinceTide += 1;
    if (sinceTide >= params.epochMoves) {
      tickEpoch(true);
      sinceTide = 0;
    }
  }
  const tideMoves = sinceTide;
  updatePeaks();
  const living = livingByOwner(cells);
  const owners = [...living.keys()];
  const standingOwners = /* @__PURE__ */ new Set([...owners, ...seasonPoints.keys(), ...peak.keys()]);
  const crownsOf = (o) => seasons.filter((s) => s.winner === o).length;
  const standings = [...standingOwners].map((owner) => ({
    owner,
    seasonPoints: seasonPoints.get(owner) ?? 0,
    territory: living.get(owner)?.cells ?? 0,
    vitality: living.get(owner)?.vitality ?? 0,
    crowns: crownsOf(owner),
    peak: peak.get(owner) ?? 0,
    conquests: conquests.get(owner) ?? 0
  })).sort(
    (a, b) => b.seasonPoints - a.seasonPoints || b.vitality - a.vitality || a.owner.localeCompare(b.owner)
  );
  const frontier = /* @__PURE__ */ new Set();
  const confirmH = (tipHeight ?? 0) - CONFIRM_DEPTH;
  for (const k of cells.keys()) {
    const c = claimedAt.get(k);
    if (c === void 0) continue;
    if (c === PENDING_HEIGHT || c > confirmH) frontier.add(k);
  }
  return {
    header,
    params,
    tideMoves,
    cells,
    moves,
    epoch,
    season: Math.floor(epoch / SEASON_EPOCHS),
    epochsLeftInSeason: SEASON_EPOCHS - epoch % SEASON_EPOCHS,
    budgets,
    tendsUsed,
    seasonPoints,
    seasons,
    standings,
    owners,
    tentative,
    confirmedEpoch,
    justCrownedSeason: justCrowned,
    lastTide,
    frontier
  };
}
function myBudget(state, myPubkeyHex, myAddress) {
  return state.budgets.get(myPubkeyHex) ?? state.budgets.get(myAddress) ?? START_BUDGET;
}
function myTendsLeft(state, myPubkeyHex, myAddress) {
  const used = state.tendsUsed.get(myPubkeyHex) ?? state.tendsUsed.get(myAddress) ?? 0;
  return Math.max(0, state.params.tendCap - used);
}
export {
  COST_CONTEST,
  COST_GROW,
  EPOCH_MOVES,
  GRID_H,
  GRID_W,
  MAX_VITALITY,
  TEND_CAP,
  cellKey,
  foldReef,
  myBudget,
  myTendsLeft
};

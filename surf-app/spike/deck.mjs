// Deck state machine: which channels are warm (mounted), which is current,
// which get evicted. Pure — no DOM, no timers. LRU recency = the last moment
// a channel was the current one. The shell maps mounted/evicted to iframe
// creation/removal (spec §2.2: N most-recently-watched stay mounted; LRU
// eviction; one pinnable; the current and pinned channels are never
// eviction candidates).
export class Deck {
  #order; #warm; #warmSize; #tick = 0; #current = null; #pinned = null;

  constructor(ids, warmSize) {
    if (warmSize < 2) throw new Error('warmSize must be >= 2');
    this.#order = [...ids];
    this.#warm = new Map(); // id -> last-current tick
    this.#warmSize = warmSize;
  }

  get current() { return this.#current; }
  get warm() { return [...this.#warm.keys()]; }
  get pinned() { return this.#pinned; }

  tune(id) {
    if (!this.#order.includes(id)) throw new Error(`unknown channel ${id}`);
    const mounted = this.#warm.has(id) ? [] : [id];
    this.#warm.set(id, ++this.#tick);
    this.#current = id;
    const evicted = [];
    while (this.#warm.size > this.#warmSize) {
      const candidates = [...this.#warm.entries()]
        .filter(([cid]) => cid !== this.#current && cid !== this.#pinned)
        .sort((a, b) => a[1] - b[1]);
      if (candidates.length === 0) break; // warm = {current, pinned}; nothing evictable
      const [victim] = candidates[0];
      this.#warm.delete(victim);
      evicted.push(victim);
    }
    return { mounted, evicted, current: this.#current };
  }

  next() { return this.tune(this.#neighbor(+1)); }
  prev() { return this.tune(this.#neighbor(-1)); }

  #neighbor(step) {
    const i = this.#order.indexOf(this.#current);
    return this.#order[(i + step + this.#order.length) % this.#order.length];
  }

  pin(id) {
    if (!this.#warm.has(id)) throw new Error('pin requires a warm channel');
    this.#pinned = id;
  }
  unpin() { this.#pinned = null; }

  evict(id) { // forced (SIGNAL LOST / wedged frame); DOM removal works regardless
    if (id === this.#current) throw new Error('cannot evict current channel');
    this.#warm.delete(id);
    if (this.#pinned === id) this.#pinned = null;
  }
}

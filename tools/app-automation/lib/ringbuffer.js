// Capped buffer for captured page events. Oldest entries are dropped first.
class RingBuffer {
  constructor(cap) {
    this.cap = cap;
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(item) {
    this.items.push(item);
    if (this.items.length > this.cap) {
      this.items.splice(0, this.items.length - this.cap);
    }
  }

  list({ tail, errorsOnly } = {}) {
    let out = this.items;
    if (errorsOnly) {
      out = out.filter(
        e =>
          e.kind === 'pageerror' ||
          e.kind === 'requestfailed' ||
          (e.kind === 'console' && e.type === 'error')
      );
    }
    if (tail && out.length > tail) out = out.slice(-tail);
    return out.slice();
  }

  clear() {
    this.items = [];
  }
}

module.exports = { RingBuffer };

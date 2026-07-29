// stubs.mjs — TEMPORARY (deleted when Tasks 5-6 land)
export function createStatic() {
  return { start() {}, stop() {}, show() {}, hide() {} };
}
export function createFlipTimer() {
  return { start() {}, end() { return null; }, abort() {}, stats() { return null; }, all: () => [] };
}
export function attachFrameProbes() {}
export function createHud() {
  return {
    sink: { channel: () => ({}), dropChannel() {}, entries: () => [] },
    drift: { max: () => 0, reset() {} },
    toggle() {}, note() {},
  };
}
export function exportResults() {}

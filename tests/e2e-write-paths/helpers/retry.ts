/**
 * Retry helper for the node's per-IP write rate limit.
 *
 * The RPC server allows 20 write-method calls per minute per client IP
 * (rpc/rate_limiter.rs). The whole suite shares one node and one IP, so
 * consecutive test files can hit HTTP 429 with a Retry-After hint. Honoring
 * it is exactly what a well-behaved client does; anything that is not a
 * rate limit (PoW rejection, auth failure, ...) is rethrown untouched so
 * negative tests still observe the real error.
 */
export async function withWriteRetry<T>(fn: () => Promise<T>, attempts = 20): Promise<T> {
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimited = msg.includes('429') || /rate limit/i.test(msg);
      if (!isRateLimited || attempts-- <= 0) {
        throw err;
      }
      const hinted = msg.match(/Retry after (\d+)\s*ms/i);
      const waitMs = hinted ? Number(hinted[1]) + 250 : 3250;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

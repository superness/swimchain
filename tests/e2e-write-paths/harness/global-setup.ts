/**
 * Vitest globalSetup: boots one regtest node for the whole suite,
 * tears it down (and its temp data dir) afterwards.
 */

import { NodeHarness, RPC_URL } from './node-harness';

export default async function globalSetup(): Promise<() => Promise<void>> {
  const harness = new NodeHarness();
  console.log(`[e2e] starting regtest node (${harness.binary}) ...`);
  const t0 = Date.now();
  await harness.start();
  console.log(`[e2e] node healthy at ${RPC_URL} after ${Date.now() - t0}ms`);

  return async () => {
    console.log('[e2e] node log tail:\n' + harness.logTail(15));
    console.log('[e2e] stopping regtest node ...');
    await harness.stop();
    console.log('[e2e] node stopped, temp data dir removed');
  };
}

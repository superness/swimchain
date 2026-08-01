import { useEffect, useState } from 'react';
import { useRpc, type OpenOffer } from '@swimchain/react';
import { pickGlobalOffer } from './lib/join';
import { DEFCON_SPONSOR } from './lib/config';

const POLL_MS = 15_000;

/**
 * The primary CTA: run a full node and claim the GLOBAL (unscoped)
 * sponsorship offer — full, unrestricted network access, not the
 * browser-sandboxed grant `<BrowserJoin/>` claims. Renders the live offer id
 * into a copy-paste command block so an attendee never has to go hunting
 * for it themselves.
 */
export function RunANode() {
  const { rpc, connected } = useRpc();
  const [offer, setOffer] = useState<OpenOffer | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!rpc || !connected || !DEFCON_SPONSOR) return;
    let cancelled = false;

    async function poll() {
      try {
        const list = await rpc!.call<{ offers?: OpenOffer[] }>('list_sponsorship_offers', {});
        if (cancelled) return;
        setOffer(pickGlobalOffer(list.offers ?? [], DEFCON_SPONSOR));
      } catch {
        // Transient network trouble — keep showing the last good offer id
        // (or the loading state) rather than flashing an error over a CTA.
      } finally {
        if (!cancelled) setChecked(true);
      }
    }

    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [rpc, connected]);

  const offerIdText = offer
    ? offer.offer_id
    : checked
      ? 'no-global-offer-open-right-now'
      : 'finding-the-open-offer…';

  return (
    <section className="run-a-node">
      <p className="eyebrow">Run a node (primary)</p>
      <h2>Full network access — no sandbox.</h2>
      <p className="lede">
        <a className="btn primary" href="/download">
          Download a node
        </a>
      </p>
      <div className="cmd-scroll">
        <pre className="cmd">
{`# 1. get a node        (downloads: /download)
# 2. create your identity (mines identity PoW — takes a few minutes)
sw identity create
# 3. claim your sponsorship — full network access
sw sponsor claim ${offerIdText} --application "<THE CODE FROM YOUR STICKER>"`}
        </pre>
      </div>
      <p className="fine-print">
        Browser accounts are sandboxed to the DEF CON space, permanently — the
        protocol has no upgrade path by design. Run a node and you get an
        unrestricted identity.
      </p>
    </section>
  );
}

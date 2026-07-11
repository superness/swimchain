import { withBase } from '@/lib/base-path';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The Swimchain Protocol',
  description:
    'What makes the Swimchain protocol different: proof-of-work as participation, pooled engagement, adaptive decay, fork-friendly chains, organic communities, and view-to-host distribution.',
  openGraph: {
    title: 'The Swimchain Protocol',
    description: 'The mechanics behind decentralized, unownable social media',
    url: '/protocol',
  },
};

export default function ProtocolPage() {
  return (
    <div className="about-page">
      <header className="page-header">
        <h1>The Swimchain Protocol</h1>
        <p className="tagline">
          The mechanics that make the promises hold
        </p>
      </header>

      <section className="section">
        <h2>Overview</h2>
        <p>
          Swimchain&apos;s guarantees &mdash; no ads, no manipulation, no
          owner &mdash; aren&apos;t policies. They&apos;re consequences of
          protocol mechanics. This page explains the mechanics. Everything
          described here is implemented and running; the full specifications
          are in the{' '}
          <a href="https://github.com/superness/swimchain/tree/main/specs">
            open-source repository
          </a>.
        </p>
      </section>

      <section className="section" id="mining-is-paying">
        <h2>Mining Is Paying</h2>
        <p>
          There is no miner class on Swimchain. Every action &mdash; posting,
          replying, keeping content alive &mdash; carries its own small
          proof-of-work, and that work is the payment. Effort aggregates
          upward through a recursive block tree: actions roll up into content
          blocks, content blocks into space blocks, space blocks into the
          root chain.
        </p>
        <ul>
          <li>Creating a post costs the most work</li>
          <li>Replying costs less &mdash; discussion is encouraged</li>
          <li>Engagement to persist content costs the least</li>
          <li>Nobody profits from anyone else&apos;s work</li>
        </ul>
        <p>
          The result: participation is the security model. There are no
          block rewards, no tokens, and nothing to speculate on.
        </p>
      </section>

      <section className="section" id="pooled-engagement">
        <h2>Pooled Engagement Defeats Sybils</h2>
        <p>
          Keeping content alive requires a fixed pool of total engagement
          work. Anyone can contribute to the pool &mdash; but the total is
          what matters, not the number of contributors:
        </p>
        <ul>
          <li>One person contributing 60 seconds of work: pool complete</li>
          <li>100 fake accounts contributing 0.6 seconds each: same total, same result</li>
          <li>Incomplete pools expire and the work is lost</li>
        </ul>
        <p>
          Sock puppets provide exactly zero advantage. Self-promotion
          isn&apos;t banned &mdash; it&apos;s just paying full price to keep
          content alive that nobody else cares about.
        </p>
      </section>

      <section className="section" id="adaptive-decay">
        <h2>Adaptive Decay, Bounded Storage</h2>
        <p>
          Content decays unless the community engages with it &mdash; and the
          decay rate is not fixed. The half-life adapts to storage pressure:
          when the chain grows fast, content decays faster; when activity is
          low, content lives longer. The system targets a bounded storage
          footprint instead of growing forever.
        </p>
        <p>
          This is why Swimchain can do what most chains can&apos;t: the whole
          thing fits on a phone. A mobile device can be a <em>full node</em>,
          not a second-class light client that trusts someone else&apos;s
          server.
        </p>
      </section>

      <section className="section" id="forks">
        <h2>Forks Are the Escape Hatch</h2>
        <p>
          On most blockchains, a 51% attack is existential. On Swimchain,
          it&apos;s self-defeating. If an attacker captures a chain, the
          community forks away &mdash; with their identities and content
          &mdash; and the new fork can exclude the attacker entirely.
        </p>
        <p>
          The attacker &ldquo;wins&rdquo; an empty chain. Capture is
          economically irrational, which is the strongest deterrent there is.
          Forks aren&apos;t failures on Swimchain; they&apos;re how
          communities govern themselves without a government.
        </p>
      </section>

      <section className="section" id="organic-communities">
        <h2>Communities Form Themselves</h2>
        <p>
          When a group of users interact mostly with each other, the network
          detects the cluster from chain data and gives it its own space
          &mdash; automatically, by consensus, with no admin deciding
          anything. Tight-knit groups get their own discoverable home instead
          of crowding the parent space.
        </p>
        <p>
          The same mechanism handles spam without moderators: a spammer
          engaging only with themselves is a &ldquo;community&rdquo; of one,
          and ends up alone in a space nobody visits. They aren&apos;t
          punished &mdash; they get exactly what they built.
        </p>
      </section>

      <section className="section" id="view-to-host">
        <h2>View-to-Host Distribution</h2>
        <p>
          You only ever host content you chose to look at. Nodes cache and
          serve what their user viewed &mdash; nothing is pushed to your disk,
          and nothing is fetched on your behalf.
        </p>
        <ul>
          <li>Consent-based: your storage holds only what you opened</li>
          <li>Spam-immune: don&apos;t view it, never download it</li>
          <li>Honest availability: content survives while viewers exist</li>
        </ul>
        <p>
          The chain record of a post (who, when, proof-of-work) persists
          independently, so you can always verify something was said &mdash;
          even after the content itself has drifted away.
        </p>
      </section>

      <section className="section" id="recognition">
        <h2>Recognition Without an Economy</h2>
        <p>
          Swimchain rewards contribution with recognition, not currency.
          Achievements are permanent, non-transferable badges for real
          milestones &mdash; your first post, hosting streaks, lifetime
          bandwidth served to peers. They can&apos;t be bought, traded, or
          farmed.
        </p>
        <p>
          Alongside that, every poster has a reputation that decays when the
          community attests their content as spam and recovers over time with
          good behavior. Accountability comes from a persistent pseudonymous
          identity with something to lose &mdash; not from a real name, an
          email, or a phone number.
        </p>
      </section>

      <section className="section" id="friction">
        <h2>Friction Is a Feature</h2>
        <p>
          Posting takes seconds of computation, and that&apos;s deliberate.
          The delay is a structural pause that interrupts impulse posting,
          discourages doomscrolling, and self-selects for people who mean
          what they write. Engagement-optimized platforms remove friction
          because friction reduces extractable attention. Swimchain inverts
          that: friction is the defense.
        </p>
        <p>
          It&apos;s never instant, for anyone, on any device. Quality over
          quantity is enforced by physics, not by policy.
        </p>
      </section>

      <section className="section">
        <h2>Go Deeper</h2>
        <ul className="link-list">
          <li><a href={withBase('/about')}>About Swimchain</a></li>
          <li><a href={withBase('/docs/search-ranking')}>Search Ranking Documentation</a></li>
          <li><a href="https://github.com/superness/swimchain/tree/main/specs">Protocol Specifications (SPEC_01&ndash;SPEC_13)</a></li>
          <li><a href="https://github.com/superness/swimchain/blob/main/VISION.md">Vision Document</a></li>
        </ul>
      </section>
    </div>
  );
}

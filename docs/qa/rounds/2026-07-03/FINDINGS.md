# QA Round 1 — Findings (2026-07-03)

**Method:** operator-driven (no persona arms this round). Real Playwright captures of
the live public surface at desktop (1366px) and phone (iPhone 13 / 390px) viewports,
vision review of the actual pixels, measured load times. Shots in `shots/`.

## Headline metric
**Diane (unassisted time-to-first-message):** NOT YET MEASURABLE end-to-end — blocked
on findings F2 + F3 below (no consumer entry on the public landing; invite token is a
raw blob). The funnel exists but has two friction walls a non-technical user hits before
first message. Fix those, then run the timed walk.

## Performance (measured, cold networkidle)
| Page | Desktop | Phone | Target | Verdict |
|---|---|---|---|---|
| Landing | 3586ms | 738ms | <2s paint | Desktop cold-load high (JS decay animation boot); phone fine |
| Developers | 556ms | 549ms | <2s | good |
| Invite (/i/) | 559ms | 568ms | <2s | good |

Desktop landing's 3.6s is first-hit-cold with the live decay demo booting; warm loads and
all other pages are well under target. Not a blocker; note for a later JS-defer pass.

## Design / visual review (from the pixels)

**Strengths (real, not placeholder):** the landing is editorial and confident — the hero
live-decaying-post demo ("First post from the open water. If you stop paying attention to
me, I will sink," heat bar at 98%, "Keep it alive" button) is a genuinely great explanation
of decay. "Three laws instead of a landlord," the client grid, the terminal quickstart, the
specs list all read as a finished product. The invite page tone is warm and correct: "A
friend wants you in… no company in the middle, no ads, no algorithm deciding what you see."

### F1 — HIGH (mobile) — nav bar overflows / clips on phone
`landing-phone.png`: the desktop nav row is jammed into 390px — "Run a node" wraps to three
stacked lines and "Developers" is clipped to "Develo". No hamburger. Every phone visitor from
a social post sees a broken header first. Fix: collapse to a hamburger (or hide nav) under
~640px.

### F2 — HIGH (conversion) — no consumer entry on the public landing
Both hero CTAs are "Run a node" and "Read the protocol." A normal person arriving from a
tweet is offered technical homework, not a way in. The invite page has the right button
("Download Swimchain") but the *public landing* — the URL a blast links to — does not. Fix:
add a primary "Get Swimchain" / "Join" CTA (→ /download) as the first button; demote "Run a
node" to secondary.

### F3 — HIGH (mom-path) — raw base64 invite token dumped on screen
`invite-phone.png`: the invite code renders as a massive multi-line base64 blob
(`eyJ2IjoxLCJvZmZlcl9pZCI6…`) the user is implicitly asked to copy. To Diane this is a wall
of gibberish. Fix: (a) make the Download button carry the token to the installer (deep link
or bundled hand-off) so she never copies anything; and/or (b) show a short friendly code with
the raw token behind a single Copy button, not displayed raw.

### F4 — MEDIUM — invite Download → installer token hand-off unproven
The /i/ Download button points at /download (the generic installer). There is no evidence the
sponsor's token travels to the freshly installed app, so the manual paste of the F3 blob is
currently the real path. Needs the installer/app to accept the token via deep link or a
copied-to-clipboard hand-off the onboarding reads.

## Fix priority
1. F1 mobile nav (cheap CSS) — do now.
2. F2 consumer CTA (cheap) — do now.
3. F3 token display (small) — do now (friendly code + copy, hide raw).
4. F4 installer token hand-off (M, needs app change) — board lane.

## Not yet covered this round (needs the client dev servers + regtest node running)
The in-app flows — identity creation, first post + PoW wait, DM round trip, chat invite
accept, PoW time on weak hardware — were NOT exercised. Those are round 2 with the clients
booted against a regtest node (or against the live /browse gateway once it lands).

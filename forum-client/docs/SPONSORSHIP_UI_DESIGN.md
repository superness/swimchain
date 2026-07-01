# Sponsorship UI Design Document

## Problem

New users who create an identity in the forum-client see a banner: "Your identity is not sponsored." They cannot post, reply, or vote. There is no in-app path to get sponsored. The entire offer/claim/approve lifecycle exists only in the CLI (`sw sponsor ...`). This makes the network unusable from the browser.

## Goal

Build the complete sponsorship lifecycle into the forum-client so that:
1. Unsponsored users can discover and claim available sponsorship offers
2. Sponsored users can create offers and manage incoming claims
3. The sponsorship banner directs users to take action rather than just informing them

## Current State

### What exists in the backend

**Storage layer** (`src/sponsorship/offer_store.rs`) — fully implemented:
- `create_offer`, `get_offer`, `delete_offer`, `list_by_sponsor`
- `submit_claim`, `get_claim`, `remove_claim`, `get_pending_claims`
- `list_active_offers`, `list_active_offers_paginated`, `get_offers_for_newcomer`
- `filter_by_type`, `increment_claimed_count`, `decrement_claimed_count`

**CLI commands** (`src/cli/commands/sponsor.rs`) — fully implemented:
- `offer-create`, `offer-list`, `offer-view`, `offer-cancel`
- `claim`, `approve`, `reject`
- `status`, `genesis-claim`, `direct`

**RPC methods** (`src/rpc/methods.rs`) — only status checks:
- `get_sponsorship_info` — check if identity is sponsored
- `register_genesis_identity` — claim genesis slot
- `register_sponsored_identity` — direct sponsorship (requires sponsor signature)

**Forum-client** (`forum-client/src/`):
- `useSponsorship` hook — checks `isSponsored` status
- `SponsorshipBanner` — shows "not sponsored" warning
- `getSponsorshipInfo()` on RPC client — only method available

### What is missing

**RPC methods** — No endpoints for the offer/claim lifecycle:
- No way to list active offers
- No way to create offers from browser
- No way to claim offers from browser
- No way to approve/reject claims from browser

**Forum-client UI** — No sponsorship management pages or components.

---

## Design

### Architecture

```
 Unsponsored User                    Sponsored User (Sponsor)
 ────────────────                    ────────────────────────
       │                                    │
  See banner with                    Navigate to
  "Find a Sponsor"                   /sponsorship
  link                                      │
       │                             ┌──────┴──────┐
       ▼                             ▼             ▼
  /sponsorship                  "Create Offer"  "My Offers"
  (Offers tab)                   form modal      list view
       │                             │             │
       ▼                             ▼             ▼
  Browse active                 RPC: create    See pending
  offers list                   _offer         claims per offer
       │                                           │
       ▼                                      ┌────┴────┐
  "Claim" button                              ▼         ▼
  on an offer                            Approve    Reject
       │                                 claim      claim
       ▼                                    │
  RPC: claim_offer                   RPC: approve_claim
       │                                    │
       ▼                                    ▼
  "Pending" state                    New member gets
  shown in UI                        StoredSponsorship
       │                                    │
       ▼                                    ▼
  Sponsor approves               Both see confirmation
  (from their UI)
       │
       ▼
  isSponsored = true
  Banner disappears
```

### New RPC Methods Required

These mirror the existing CLI commands but are callable from the browser via JSON-RPC.

#### `list_sponsorship_offers`

Browse active offers. Available to all users (no auth required for discovery).

```
Request:
{
  "method": "list_sponsorship_offers",
  "params": {
    "offset": 0,          // pagination
    "limit": 20,
    "offer_type": null     // optional filter: "open" | "probationary"
  }
}

Response:
{
  "offers": [
    {
      "offer_id": "hex(16 bytes)",
      "sponsor_pubkey": "hex(32 bytes)",
      "offer_type": "probationary",
      "slots_total": 3,
      "slots_remaining": 2,
      "expires_at": 1737936000,
      "requirements": {
        "min_pow_difficulty": 0,
        "application_required": false
      },
      "created_at": 1737849600
    }
  ],
  "total": 12,
  "has_more": false
}
```

#### `get_sponsorship_offer`

View a single offer with its pending claims (claims only visible to the offer's sponsor).

```
Request:
{
  "method": "get_sponsorship_offer",
  "params": {
    "offer_id": "hex(16 bytes)"
  }
}

Response:
{
  "offer_id": "hex",
  "sponsor_pubkey": "hex",
  "offer_type": "probationary",
  "slots_total": 3,
  "slots_remaining": 2,
  "expires_at": 1737936000,
  "created_at": 1737849600,
  "requirements": {
    "min_pow_difficulty": 0,
    "application_required": false
  },
  "pending_claims": [              // only populated if caller is sponsor
    {
      "claimant_pubkey": "hex",
      "claimed_at": 1737850000,
      "application_text": "I'd like to join..."
    }
  ]
}
```

#### `create_sponsorship_offer`

Sponsor creates an offer. Requires signature auth. Sponsor must be Active.

```
Request:
{
  "method": "create_sponsorship_offer",
  "params": {
    "sponsor_pubkey": "hex(32 bytes)",
    "slots": 3,                        // 1-10
    "offer_type": "probationary",      // "open" | "probationary"
    "expires_days": 30,                // 1-365
    "min_pow_difficulty": 0,           // 0-255
    "application_required": false,
    "signature": "hex(64 bytes)",      // sponsor signs offer params
    "timestamp": 1737849600
  }
}

Response:
{
  "offer_id": "hex(16 bytes)",
  "expires_at": 1737936000,
  "slots": 3
}
```

**Signature message format:**
```
"swimchain-sponsor-offer:" || sponsor(32) || slots(1) || offer_type(1) ||
expires_days(4 BE) || min_pow(1) || app_required(1) || timestamp(8 BE)
= 48 bytes + prefix
```

#### `claim_sponsorship_offer`

Unsponsored user claims an available offer.

```
Request:
{
  "method": "claim_sponsorship_offer",
  "params": {
    "offer_id": "hex(16 bytes)",
    "claimant_pubkey": "hex(32 bytes)",
    "application_text": "Optional message to sponsor",   // max 2000 chars
    "pow_nonce": 12345,
    "pow_difficulty": 12,
    "pow_nonce_space": "hex",
    "pow_hash": "hex",
    "signature": "hex(64 bytes)",      // claimant signs claim
    "timestamp": 1737850000
  }
}

Response:
{
  "offer_id": "hex",
  "status": "pending",
  "message": "Claim submitted. The sponsor will review your request."
}
```

#### `approve_sponsorship_claim`

Sponsor approves a pending claim.

```
Request:
{
  "method": "approve_sponsorship_claim",
  "params": {
    "offer_id": "hex(16 bytes)",
    "claimant_pubkey": "hex(32 bytes)",
    "sponsor_pubkey": "hex(32 bytes)",
    "signature": "hex(64 bytes)",      // sponsor signs approval
    "timestamp": 1737851000
  }
}

Response:
{
  "claimant_pubkey": "hex",
  "claimant_address": "cs1q...",
  "depth": 2,
  "probationary": true,
  "status": "Active"
}
```

#### `reject_sponsorship_claim`

Sponsor rejects a pending claim.

```
Request:
{
  "method": "reject_sponsorship_claim",
  "params": {
    "offer_id": "hex(16 bytes)",
    "claimant_pubkey": "hex(32 bytes)",
    "sponsor_pubkey": "hex(32 bytes)",
    "signature": "hex(64 bytes)",
    "timestamp": 1737851000
  }
}

Response:
{
  "rejected": true,
  "offer_id": "hex",
  "claimant_pubkey": "hex"
}
```

#### `cancel_sponsorship_offer`

Sponsor cancels their own offer.

```
Request:
{
  "method": "cancel_sponsorship_offer",
  "params": {
    "offer_id": "hex(16 bytes)",
    "sponsor_pubkey": "hex(32 bytes)",
    "signature": "hex(64 bytes)",
    "timestamp": 1737851000
  }
}

Response:
{
  "cancelled": true,
  "offer_id": "hex"
}
```

#### `list_my_sponsorship_offers`

Sponsor views their own offers with claim counts.

```
Request:
{
  "method": "list_my_sponsorship_offers",
  "params": {
    "sponsor_pubkey": "hex(32 bytes)"
  }
}

Response:
{
  "offers": [
    {
      "offer_id": "hex",
      "offer_type": "probationary",
      "slots_total": 3,
      "slots_claimed": 1,
      "slots_pending": 2,
      "expires_at": 1737936000,
      "created_at": 1737849600,
      "is_expired": false
    }
  ]
}
```

#### `get_my_claim_status`

Unsponsored user checks the status of their pending claim.

```
Request:
{
  "method": "get_my_claim_status",
  "params": {
    "claimant_pubkey": "hex(32 bytes)"
  }
}

Response:
{
  "has_pending_claim": true,
  "offer_id": "hex",
  "claimed_at": 1737850000,
  "offer_expires_at": 1737936000,
  "sponsor_pubkey": "hex"
}
```

---

### UI Components

#### 1. Updated `SponsorshipBanner`

Replace the passive informational banner with an actionable one.

```
┌──────────────────────────────────────────────────────────────────┐
│  ⓘ  Your identity is not sponsored. You can browse but cannot   │
│     post, reply, or vote.                                        │
│                                                                  │
│     [ Find a Sponsor ]          [ What is sponsorship? ]         │
└──────────────────────────────────────────────────────────────────┘
```

- "Find a Sponsor" navigates to `/sponsorship`
- "What is sponsorship?" opens an inline explainer or links to `/sponsorship#about`
- When the user has a pending claim, the banner changes:

```
┌──────────────────────────────────────────────────────────────────┐
│  ⏳ Sponsorship claim pending — waiting for sponsor approval.    │
│                                                                  │
│     [ View Status ]                                              │
└──────────────────────────────────────────────────────────────────┘
```

#### 2. Sponsorship Page (`/sponsorship`)

A new page accessible from the banner and the sidebar. Content varies based on sponsorship status.

**Tab structure:**

| Tab | Visible to | Content |
|-----|-----------|---------|
| Find a Sponsor | Unsponsored users | Browse and claim active offers |
| My Offers | Sponsored users | Create/manage offers, review claims |
| My Status | All users | Sponsorship details, sponsor tree |

##### Tab: Find a Sponsor (unsponsored users)

**Explainer section (top of page):**
```
┌──────────────────────────────────────────────────────────────┐
│  How Sponsorship Works                                        │
│                                                               │
│  Swimchain requires every identity to be vouched for by an    │
│  existing member. This prevents spam and Sybil attacks while  │
│  keeping the network open.                                    │
│                                                               │
│  1. Browse available sponsorship offers below                 │
│  2. Claim an offer — some may ask for a short application     │
│  3. The sponsor reviews and approves your claim               │
│  4. You're in! You can now post, reply, and vote              │
│                                                               │
│  Your public key (share this with potential sponsors):         │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 50b5a333a3f2962a... (full hex)            [ Copy ]       │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Offers list:**
```
┌─────────────────────────────────────────────────────────────┐
│  Available Sponsorship Offers                      2 offers  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Sponsor: cs1q7f3k...2a4m                              │  │
│  │  Type: Probationary (180-day trial)                    │  │
│  │  Slots: 2 of 3 remaining                               │  │
│  │  Expires: in 12 days                                    │  │
│  │  Requirements: Application required                     │  │
│  │                                                         │  │
│  │  [ Claim This Offer ]                                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Sponsor: cs1qz9x...8h2p                              │  │
│  │  Type: Open (full sponsorship)                         │  │
│  │  Slots: 1 of 1 remaining                               │  │
│  │  Expires: in 28 days                                    │  │
│  │  Requirements: None                                     │  │
│  │                                                         │  │
│  │  [ Claim This Offer ]                                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  No offers available?                                        │
│  Share your public key with someone you know on the network. │
└─────────────────────────────────────────────────────────────┘
```

**Pending claim state** (replaces offers list when user has an active claim):
```
┌─────────────────────────────────────────────────────────────┐
│  Your Claim is Pending                                       │
│                                                              │
│  You claimed a sponsorship offer from cs1q7f3k...2a4m.      │
│  The sponsor will review your application.                   │
│                                                              │
│  Submitted: 2 hours ago                                      │
│  Offer expires: in 12 days                                   │
│                                                              │
│  There's nothing else to do — check back later.              │
└─────────────────────────────────────────────────────────────┘
```

##### Tab: My Offers (sponsored users)

```
┌─────────────────────────────────────────────────────────────┐
│  My Sponsorship Offers                  [ + Create Offer ]   │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Offer #a3f2...  ·  Probationary  ·  Expires in 18d   │  │
│  │  Slots: 1/3 claimed  ·  2 pending claims               │  │
│  │                                                         │  │
│  │  Pending Claims:                                        │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │  cs1q8k2...4n  ·  Claimed 3h ago                │   │  │
│  │  │  "I'm interested in contributing to the          │   │  │
│  │  │  photography space."                              │   │  │
│  │  │                                                   │   │  │
│  │  │  [ Approve ]  [ Reject ]                          │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │  cs1qp7z...9w  ·  Claimed 1d ago                │   │  │
│  │  │  (no application text)                            │   │  │
│  │  │                                                   │   │  │
│  │  │  [ Approve ]  [ Reject ]                          │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │                                                         │  │
│  │  [ Cancel Offer ]                                       │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Create Offer modal:**
```
┌─────────────────────────────────────────────────────────────┐
│  Create Sponsorship Offer                           ✕        │
│  ─────────────────────────────────────────────────────────── │
│                                                              │
│  Offer Type                                                  │
│  ○ Probationary (recommended)                                │
│    New member has a 180-day trial. Reduced consequences       │
│    for you if they misbehave.                                │
│  ○ Open                                                      │
│    Full sponsorship. You bear full consequence responsibility.│
│                                                              │
│  Number of Slots                                             │
│  [ 1 ▼ ]  (how many people can claim this offer)             │
│                                                              │
│  Expires After                                               │
│  [ 30 ] days                                                 │
│                                                              │
│  ☐ Require application text                                  │
│    Claimants must write a short message explaining why they   │
│    want to join.                                             │
│                                                              │
│  ─────────────────────────────────────────────────────────── │
│  Note: You are responsible for the behavior of people you    │
│  sponsor. If a sponsored identity is flagged for spam, you   │
│  may receive a penalty.                                      │
│                                                              │
│                              [ Cancel ]  [ Create Offer ]    │
└─────────────────────────────────────────────────────────────┘
```

##### Tab: My Status (all users)

```
┌─────────────────────────────────────────────────────────────┐
│  Sponsorship Status                                          │
│                                                              │
│  Status:       Active                                        │
│  Sponsored by: cs1q7f3k...2a4m                              │
│  Depth:        2                                             │
│  Since:        Jan 15, 2026                                  │
│  Probationary: No                                            │
│  Penalty:      None                                          │
│                                                              │
│  Sponsorship Chain:                                          │
│  Genesis → cs1q7f3k...2a4m → You                           │
└─────────────────────────────────────────────────────────────┘
```

For unsponsored users:
```
┌─────────────────────────────────────────────────────────────┐
│  Sponsorship Status                                          │
│                                                              │
│  Status: Not sponsored                                       │
│                                                              │
│  Your public key:                                            │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ 50b5a333a3f2962a...                       [ Copy ]   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Share this with an existing member who can sponsor you,     │
│  or browse the "Find a Sponsor" tab to claim an open offer.  │
└─────────────────────────────────────────────────────────────┘
```

#### 3. Claim Modal

Shown when clicking "Claim This Offer" on an offer card.

```
┌─────────────────────────────────────────────────────────────┐
│  Claim Sponsorship Offer                            ✕        │
│  ─────────────────────────────────────────────────────────── │
│                                                              │
│  Sponsor: cs1q7f3k...2a4m                                   │
│  Type: Probationary (180-day trial period)                   │
│  Expires: in 12 days                                         │
│                                                              │
│  Application (required by sponsor)                           │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Tell the sponsor why you want to join...             │    │
│  │                                                      │    │
│  │                                                      │    │
│  └──────────────────────────────────────────────────────┘    │
│  0/2000 characters                                           │
│                                                              │
│  Mining proof-of-work...  ████████░░░░  65%                  │
│                                                              │
│  ─────────────────────────────────────────────────────────── │
│  By claiming, your public key is shared with the sponsor.    │
│  They decide whether to approve your request.                │
│                                                              │
│                          [ Cancel ]  [ Submit Claim ]        │
└─────────────────────────────────────────────────────────────┘
```

#### 4. Sidebar Link

Add a "Sponsorship" item to the sidebar navigation, visible to all users. Show a badge for sponsors who have pending claims to review.

```
  Spaces
  Chat
  Search
> Sponsorship  (2)     ← badge = pending claims count
  ───
  Settings
  Identity
```

---

### File Structure

```
forum-client/src/
├── pages/
│   └── Sponsorship.tsx              # Main sponsorship page with tabs
│   └── Sponsorship.css
├── components/
│   ├── SponsorshipBanner.tsx        # Updated: actionable banner
│   ├── SponsorshipBanner.css        # Updated
│   ├── SponsorshipOfferCard.tsx     # Offer card for browse list
│   ├── SponsorshipOfferCard.css
│   ├── ClaimOfferModal.tsx          # Modal for claiming an offer
│   ├── ClaimOfferModal.css
│   ├── CreateOfferModal.tsx         # Modal for creating an offer
│   ├── CreateOfferModal.css
│   └── SponsorshipStatus.tsx        # Status display component
│   └── SponsorshipStatus.css
├── hooks/
│   ├── useSponsorship.tsx           # Updated: add claim status, offers
│   ├── useSponsorshipOffers.ts      # Hook for fetching/paginating offers
│   └── useMySponsorshipOffers.ts    # Hook for sponsor's own offers
└── lib/
    └── rpc.ts                       # Updated: add new RPC methods
```

---

### Implementation Phases

#### Phase 1: RPC Endpoints

Add the 8 new RPC methods to `src/rpc/methods.rs`. The storage layer (`OfferStore`) already has all the methods — these RPC endpoints are thin wrappers that:
1. Parse params and validate types
2. Verify signature auth where required
3. Call the existing `OfferStore` / `SponsorshipStore` methods
4. Return JSON results

Files to modify:
- `src/rpc/methods.rs` — add method dispatch and handler functions

Methods that need signature auth: `create_sponsorship_offer`, `claim_sponsorship_offer`, `approve_sponsorship_claim`, `reject_sponsorship_claim`, `cancel_sponsorship_offer`, `list_my_sponsorship_offers`.

Methods open to all: `list_sponsorship_offers`, `get_sponsorship_offer` (claims redacted for non-sponsors), `get_my_claim_status`.

#### Phase 2: Forum-Client RPC Methods

Add corresponding methods to the `SwimchainRpc` class in `forum-client/src/lib/rpc.ts`.

```typescript
// Discovery
async listSponsorshipOffers(params?: {
  offset?: number;
  limit?: number;
  offerType?: 'open' | 'probationary';
}): Promise<ListOffersResult>

async getSponsorshipOffer(offerId: string): Promise<OfferDetail>

// Claiming (unsponsored users)
async claimSponsorshipOffer(params: {
  offerId: string;
  claimantPubkey: string;
  applicationText?: string;
  powNonce: number;
  powDifficulty: number;
  powNonceSpace: string;
  powHash: string;
  signature: string;
  timestamp: number;
}): Promise<ClaimResult>

async getMyClaimStatus(claimantPubkey: string): Promise<ClaimStatus>

// Sponsor management
async createSponsorshipOffer(params: {
  sponsorPubkey: string;
  slots: number;
  offerType: 'open' | 'probationary';
  expiresDays: number;
  minPowDifficulty?: number;
  applicationRequired?: boolean;
  signature: string;
  timestamp: number;
}): Promise<CreateOfferResult>

async listMySponsorshipOffers(sponsorPubkey: string): Promise<MyOffersResult>

async approveSponsorshipClaim(params: {
  offerId: string;
  claimantPubkey: string;
  sponsorPubkey: string;
  signature: string;
  timestamp: number;
}): Promise<ApproveResult>

async rejectSponsorshipClaim(params: {
  offerId: string;
  claimantPubkey: string;
  sponsorPubkey: string;
  signature: string;
  timestamp: number;
}): Promise<RejectResult>

async cancelSponsorshipOffer(params: {
  offerId: string;
  sponsorPubkey: string;
  signature: string;
  timestamp: number;
}): Promise<CancelResult>
```

#### Phase 3: Sponsorship Page & Hooks

Build the `/sponsorship` page with three tabs and supporting hooks.

1. `useSponsorshipOffers` — fetches and paginates `list_sponsorship_offers`
2. `useMySponsorshipOffers` — fetches `list_my_sponsorship_offers` with pending claims
3. Update `useSponsorship` — add `pendingClaim` state from `get_my_claim_status`
4. `Sponsorship.tsx` page — tab container with conditional content
5. `SponsorshipOfferCard.tsx` — offer display card for both browse and manage views

#### Phase 4: Claim & Offer Modals

1. `ClaimOfferModal` — application text input, PoW mining, submit claim
2. `CreateOfferModal` — offer type, slots, expiration, requirements form

Both follow existing modal patterns (InviteModal): focus trap, keyboard handling, multi-stage form with mining state.

#### Phase 5: Banner & Navigation Updates

1. Update `SponsorshipBanner` — add "Find a Sponsor" / "View Status" action buttons
2. Add sidebar link to `/sponsorship` with pending claims badge
3. Add route in `App.tsx`

---

### Signature Handling

All write operations require Ed25519 signatures from the user's keypair (stored in `localStorage` as `seed`). The forum-client already handles this pattern for `submit_post`, `create_space`, etc.:

1. Build the signing message (deterministic byte format)
2. Sign with `WasmKeypair.sign(message)` from the WASM bindings
3. Include hex-encoded signature in the RPC params
4. Server verifies signature against the claimed pubkey

The signing message formats for each operation are defined in the RPC Methods section above. The forum-client will use the same `WasmKeypair` already available via `SwimchainProvider`.

### PoW for Claims

Claiming an offer requires proof-of-work (same as posting). The forum-client already has PoW mining infrastructure (`useActionPow` hook, `PowProgress` component). Claims reuse this — the `ClaimOfferModal` triggers PoW mining before submission, showing the same progress UI used in post/space creation.

### Error States

| Scenario | User sees |
|----------|-----------|
| No offers available | Empty state: "No sponsorship offers available. Share your public key with someone you know." |
| Offer expired while viewing | Toast: "This offer has expired." Offer removed from list on refresh. |
| Offer fully claimed | Toast: "This offer has no remaining slots." Button disabled. |
| Already has pending claim | "Claim" buttons disabled. Banner shows pending status. |
| Already sponsored | "Find a Sponsor" tab hidden. "My Offers" tab shown. |
| Claim rejected | Pending claim cleared. User can claim other offers. |
| Network error | Standard error state with retry button. |

### Polling & Refresh

- **Offer list**: Fetched on page load, manual refresh button. No auto-poll (offers don't change rapidly).
- **Pending claim status**: Polled every 30 seconds while on the sponsorship page. This lets the user see when their claim is approved without manual refresh.
- **Pending claims for sponsors**: Fetched on page load and when the tab is focused. Badge count in sidebar updated on poll.
- **Banner state**: `useSponsorship` already re-checks on identity/connection change. Add check after claim submission.

### Security Considerations

- All write operations require valid Ed25519 signatures — the server verifies against the claimed pubkey.
- Offer browsing is unauthenticated (public data) to allow discovery before identity setup.
- Pending claims are only visible to the offer's sponsor (verified server-side by checking `offer.sponsor == caller identity`).
- Application text is capped at 2000 characters (enforced both client-side and server-side).
- Offer creation is rate-limited by the existing RPC rate limiter.
- The `cancel_offer` RPC verifies the caller is the offer creator before deleting.

---

## Gossip Protocol for Offer Propagation

### Why gossip, not chain

Offers are ephemeral coordination — they expire, get claimed, get cancelled. The chain records the permanent result (the `Sponsor` action from SPEC_11 Phase 6). Putting the negotiation on-chain wastes permanent storage on every node for data that's irrelevant after a few days.

Gossip matches the liveness model. Sponsorship is a social act between two humans who decide to trust each other. Requiring both to be online is not a limitation — it's a feature. A sponsor who goes offline for weeks shouldn't have stale offers sitting around with no one home to approve claims.

### Wire Protocol Messages

Message type constants are already reserved in `src/types/constants.rs` (SPEC_11 §5.1):

| Constant | Value | Direction | Purpose |
|----------|-------|-----------|---------|
| `MSG_SPONSORSHIP_OFFER` | `0x49` | Broadcast | Sponsor publishes an offer to the network |
| `MSG_SPONSORSHIP_OFFER_CLAIM` | `0x4A` | Broadcast | Claimant claims an offer |
| `MSG_SPONSORSHIP_CLAIM_RESPONSE` | `0x4B` | Broadcast | Sponsor approves/rejects a claim |
| `MSG_SPONSORSHIP_OFFER_QUERY` | `0x4C` | Request | Node requests active offers from a peer |
| `MSG_SPONSORSHIP_OFFER_LIST` | `0x4D` | Response | Peer responds with matching offers |

### Message Payloads

#### `MSG_SPONSORSHIP_OFFER` (0x49) — Offer Broadcast

Sent when a sponsor creates an offer. Broadcast to all connected peers, who re-broadcast to their peers (standard gossip fanout). Each receiving node stores the offer in its local `OfferStore`.

```
Field                  Size    Description
─────────────────────────────────────────────────────
offer_id               16      Unique offer identifier (blake3 hash truncated)
sponsor_pubkey         32      Ed25519 public key of sponsor
offer_type             1       0=Open, 1=Probationary
max_sponsees           1       Number of slots (1-10)
created_at             8       Unix timestamp (BE)
expires_at             8       Unix timestamp (BE)
min_pow_difficulty     1       Minimum PoW for claimants (0=none)
application_required   1       1=claimant must provide text
pow_nonce              8       Sponsor's PoW nonce (anti-spam)
pow_work               8       Sponsor's computed work
pow_target             32      Sponsor's PoW target hash
signature              64      Sponsor signs all preceding fields
─────────────────────────────────────────────────────
Total: 180 bytes
```

**Sponsor PoW requirement:** Offer creation requires proof-of-work from the sponsor. This prevents a single node from flooding the gossip layer with thousands of fake offers. The PoW target is computed over `blake3("sponsorship-offer:" || sponsor || offer_id || created_at)`.

**Signature message:**
```
message = "sponsorship-offer:" || offer_id(16) || offer_type(1) ||
          max_sponsees(1) || created_at(8 BE) || expires_at(8 BE) ||
          min_pow(1) || app_required(1) || pow_nonce(8 BE) || pow_target(32)
```

**Receiving node validation:**
1. Verify sponsor signature over the message
2. Verify sponsor PoW meets minimum threshold
3. Check `expires_at > now` (not already expired)
4. Check `max_sponsees` in 1-10 range
5. Check `expires_at - created_at <= 365 days`
6. Deduplicate by `offer_id` (ignore if already stored)
7. Store in local `OfferStore`
8. Re-broadcast to peers (with seen-set to prevent loops)

#### `MSG_SPONSORSHIP_OFFER_CLAIM` (0x4A) — Claim Broadcast

Sent when an unsponsored user claims an offer. Broadcast to all peers so the sponsor's node receives it regardless of network topology.

```
Field                  Size    Description
─────────────────────────────────────────────────────
offer_id               16      ID of the offer being claimed
claimant_pubkey        32      Ed25519 public key of claimant
claimed_at             8       Unix timestamp (BE)
application_length     2       Length of application text (LE, 0-2000)
application_text       var     UTF-8 text (0-2000 bytes)
pow_nonce              8       Claimant's PoW nonce
pow_work               8       Claimant's computed work
pow_target             32      Claimant's PoW target hash
signature              64      Claimant signs all preceding fields
─────────────────────────────────────────────────────
Total: 170 + application_length bytes
```

**Claimant PoW target:** `blake3("sponsorship-claim:" || offer_id || claimant || claimed_at)`.

**Signature message:**
```
message = "sponsorship-claim:" || offer_id(16) || claimant(32) ||
          claimed_at(8 BE) || sha256(application_text) || pow_nonce(8 BE) || pow_target(32)
```

**Receiving node validation:**
1. Verify offer_id exists in local OfferStore and is not expired
2. Verify claimant signature
3. Verify claimant PoW meets offer's `min_pow_difficulty` (or network minimum)
4. Check claimant is not already sponsored (`sponsorship_store.exists()`)
5. Check claimant hasn't already claimed this offer (`offer_store.has_claimed()`)
6. Store claim in local `OfferStore`
7. Re-broadcast to peers

#### `MSG_SPONSORSHIP_CLAIM_RESPONSE` (0x4B) — Approval/Rejection

Sent when a sponsor approves or rejects a claim. Broadcast so the claimant's node receives the result.

```
Field                  Size    Description
─────────────────────────────────────────────────────
offer_id               16      ID of the offer
claimant_pubkey        32      Public key of the claimant
sponsor_pubkey         32      Public key of the sponsor
response_type          1       0=Rejected, 1=Approved
timestamp              8       Unix timestamp (BE)
signature              64      Sponsor signs all preceding fields
─────────────────────────────────────────────────────
Total: 153 bytes
```

**On approval**, the receiving node:
1. Verifies sponsor owns the offer
2. Verifies sponsor signature
3. Removes the pending claim from OfferStore
4. If this is the node that submitted the claim, `useSponsorship` detects the change on next poll

**The approval does NOT directly create a `StoredSponsorship`.** The approval triggers the sponsor's node to create an on-chain `Sponsor` action (same as Phase 6). The on-chain action propagates via blocks, and `apply_sponsorship_actions_from_block` creates the `StoredSponsorship` on every node. This ensures the chain is the single source of truth, not gossip.

#### `MSG_SPONSORSHIP_OFFER_QUERY` (0x4C) — Request Offers

Sent by a node that just joined the network (or reconnected) to catch up on active offers it may have missed.

```
Field                  Size    Description
─────────────────────────────────────────────────────
max_results            2       Maximum offers to return (LE)
min_slots_remaining    1       Only offers with at least N slots
offer_type_filter      1       0xFF=any, 0=Open, 1=Probationary
─────────────────────────────────────────────────────
Total: 4 bytes
```

Sent to a random subset of peers during initial sync. Each peer responds with `MSG_SPONSORSHIP_OFFER_LIST`.

#### `MSG_SPONSORSHIP_OFFER_LIST` (0x4D) — Offer Response

Response to a query, containing serialized offers.

```
Field                  Size    Description
─────────────────────────────────────────────────────
offer_count            2       Number of offers (LE)
offers                 var     Repeated MSG_SPONSORSHIP_OFFER payloads
─────────────────────────────────────────────────────
Total: 2 + (offer_count × 180) bytes
```

Each offer in the list has the same 180-byte format as `MSG_SPONSORSHIP_OFFER`, including the original sponsor signature and PoW. Receiving node validates each one independently before storing.

### Gossip Deduplication

Each node maintains a seen-set (bounded LRU cache) of `offer_id` and `(offer_id, claimant)` pairs. Messages already in the seen-set are not re-broadcast. The seen-set is sized to hold ~10,000 entries (offers are rare compared to content actions).

### Offer Expiry and Cleanup

A background task in `tasks.rs` runs every 10 minutes and removes expired offers and their associated claims from the local `OfferStore`. This is purely local cleanup — expired offers simply stop being served in query responses and stop appearing in the UI.

---

## On-Chain Validation

### The chain is the source of truth

Gossip propagates offers and claims for discovery and coordination. But the permanent sponsorship record is an on-chain `Sponsor` action inside a block. Every node that processes a block MUST independently validate the sponsorship proofs. Nodes never blindly trust data from blocks.

### What the on-chain `Sponsor` action must carry

The existing `Action` struct has all necessary fields — they just need to be populated properly for Sponsor actions:

```
Action fields for Sponsor (ActionType = 0x0D):
─────────────────────────────────────────────────────
action_type       = Sponsor (0x0D)
actor             = sponsor pubkey (32 bytes)     — WHO is sponsoring
content_hash      = sponsee pubkey (32 bytes)     — WHO is being sponsored
timestamp         = approval timestamp (u64)      — WHEN
pow_nonce         = claimant's PoW nonce (u64)    — claimant's anti-spam proof
pow_work          = claimant's PoW work (u64)     — verifiable work amount
pow_target        = claimant's PoW target (32b)   — PoW verification input
signature         = sponsor's approval sig (64b)  — sponsor CONSENTED
parent_id         = None                          — unused
emoji             = None                          — unused
display_name      = None                          — unused
media_refs        = []                            — unused
replaces_pending  = None                          — unused
```

**Current state (Phase 6):** `pow_nonce`, `pow_work`, and `pow_target` are set to zero. The `signature` field is populated but not verified during block processing.

**Required change:** Populate the PoW fields with the claimant's proof, and verify everything during block ingestion.

### Signature message format for on-chain verification

The sponsor signs a deterministic message that any node can reconstruct:

```
message = sponsee_pubkey(32) || timestamp(8 BE)
        = 40 bytes
```

Any node can verify: `ed25519_verify(actor, message, signature)`. This proves the sponsor explicitly consented to sponsor this specific identity at this specific time.

### Block ingestion validation (`apply_sponsorship_actions_from_block`)

When a node processes a `Sponsor` action from a block, it MUST validate:

```rust
fn validate_sponsor_action(action: &Action, sponsorship_store: &SponsorshipStore) -> bool {
    // 1. SIGNATURE: Sponsor consented
    //    Reconstruct message = sponsee(32) || timestamp(8 BE)
    //    Verify ed25519(actor, message, signature)
    let sponsee = action.content_hash.unwrap();
    let mut message = [0u8; 40];
    message[0..32].copy_from_slice(&sponsee);
    message[32..40].copy_from_slice(&action.timestamp.to_be_bytes());
    if !ed25519_verify(&action.actor, &message, &action.signature) {
        warn!("Sponsor action has invalid signature — rejecting");
        return false;
    }

    // 2. SPONSOR EXISTS: Actor must be an Active sponsored identity
    //    (or genesis — genesis can sponsor immediately)
    match sponsorship_store.get(&PublicKey::from_bytes(action.actor)) {
        Ok(Some(record)) => {
            if record.status != SponsorshipStatus::Active {
                warn!("Sponsor {} is not Active — rejecting", hex::encode(&action.actor[..8]));
                return false;
            }
        }
        _ => {
            warn!("Sponsor {} not found in store — rejecting", hex::encode(&action.actor[..8]));
            return false;
        }
    }

    // 3. CLAIMANT PoW: Anti-spam work was done
    //    pow_target = blake3("sponsorship-claim:" || offer_id || claimant || timestamp)
    //    Verify leading-zero difficulty from pow_work
    if action.pow_work == 0 {
        warn!("Sponsor action has zero PoW — rejecting");
        return false;
    }
    // Verify PoW hash: sha256(pow_target || pow_nonce) has sufficient leading zeros
    let mut pow_input = Vec::with_capacity(40);
    pow_input.extend_from_slice(&action.pow_target);
    pow_input.extend_from_slice(&action.pow_nonce.to_le_bytes());
    let pow_hash = sha256(&pow_input);
    let actual_work = leading_zeros(&pow_hash);
    if actual_work < action.pow_work {
        warn!("Sponsor action PoW claimed {} but actual {}", action.pow_work, actual_work);
        return false;
    }

    // 4. DEDUP: Sponsee not already sponsored
    match sponsorship_store.exists(&PublicKey::from_bytes(sponsee)) {
        Ok(true) => {
            debug!("Sponsee already exists — skipping (idempotent)");
            return false; // not an error, just already processed
        }
        Ok(false) => {} // proceed
        Err(e) => {
            warn!("Failed to check sponsee existence: {}", e);
            return false;
        }
    }

    true
}
```

### Genesis validation (`GenesisRegister` = 0x0E)

Genesis actions have different validation — no sponsor, no PoW (bootstrapping the network):

```rust
fn validate_genesis_action(action: &Action) -> bool {
    let genesis_pubkey = action.content_hash.unwrap();

    // 1. Actor must be the genesis identity itself (self-registration)
    if action.actor != genesis_pubkey {
        return false;
    }

    // 2. Must be in the hardcoded genesis list
    let pk = PublicKey::from_bytes(genesis_pubkey);
    if !is_in_hardcoded_genesis_list(&pk) {
        return false;
    }

    // 3. Signature: genesis signs its own registration
    //    message = genesis_pubkey(32) || timestamp(8 BE)
    let mut message = [0u8; 40];
    message[0..32].copy_from_slice(&genesis_pubkey);
    message[32..40].copy_from_slice(&action.timestamp.to_be_bytes());
    ed25519_verify(&action.actor, &message, &action.signature)
}
```

### Validation flow during block processing

```
Block arrives (via handle_block_data, handle_blocks, or local formation)
    │
    ▼
For each ContentBlock:
    For each Action:
        │
        ├─ ActionType::Sponsor (0x0D)
        │   ├─ Verify sponsor signature (ed25519)
        │   ├─ Verify sponsor is Active in SponsorshipStore
        │   ├─ Verify claimant PoW (hash + difficulty)
        │   ├─ Check sponsee not already in store (dedup)
        │   ├─ Calculate depth = sponsor.depth + 1
        │   └─ Store new StoredSponsorship
        │
        ├─ ActionType::GenesisRegister (0x0E)
        │   ├─ Verify actor == content_hash (self-registration)
        │   ├─ Verify in hardcoded genesis list
        │   ├─ Verify signature
        │   ├─ Check not already in store (dedup)
        │   └─ Store new StoredSponsorship (depth=0, is_genesis=true)
        │
        └─ Other types: existing validation
```

### What happens if validation fails

A Sponsor action that fails validation is **silently skipped** — the block itself is not rejected. This is because:
- The block builder on the originating node validated the action before including it
- Other actions in the same block are still valid
- The sponsorship may have been processed from a different block already (dedup)
- Network partitions can cause temporary state disagreements that resolve

If a node consistently produces blocks with invalid Sponsor actions, peer scoring handles it (same as invalid content actions).

### Probationary flag

The on-chain action doesn't carry a probationary flag. The probationary status is derived from the offer type during the gossip negotiation and stored locally by the sponsoring node. Since probation only affects consequence propagation (sponsor bears less risk), not the sponsee's capabilities, it's acceptable for this to be determined locally by the sponsor's node and not validated by the network.

If stronger guarantees are needed later, a probationary bit could be encoded in the `emoji` field (unused for Sponsor actions) — but this is not needed for the initial implementation.

---

## Updated Implementation Phases

### Phase 0: On-Chain Validation (fix Phase 6 gap)

Update `apply_sponsorship_actions_from_block` in `src/node/router/router.rs` to validate signatures and PoW before storing sponsorship records. Update `new_sponsor` callsites to populate `pow_nonce`, `pow_work`, `pow_target` from the claimant's proof.

Files to modify:
- `src/node/router/router.rs` — add validation to `apply_sponsorship_actions_from_block`
- `src/node/tasks.rs` — same validation in the block formation path
- `src/rpc/methods.rs` — populate PoW fields in `Action::new_sponsor()` calls

### Phase 1: Gossip Wire Protocol

Implement the 5 new message types for offer/claim gossip.

Files to modify:
- `src/network/messages.rs` — add payload structs (`SponsorshipOfferPayload`, `SponsorshipClaimPayload`, etc.)
- `src/node/router/router.rs` — add dispatch arms and handler methods
- `src/node/manager.rs` — wire `OfferStore` into the router (currently CLI-only)
- `src/node/tasks.rs` — add offer expiry cleanup task, offer query during initial sync

### Phase 2: RPC Endpoints

Add 8 RPC methods that operate on the local `OfferStore` (same as before).

### Phase 3: Forum-Client RPC Methods

Add corresponding TypeScript methods to `SwimchainRpc` class.

### Phase 4: Sponsorship Page & Hooks

Build `/sponsorship` page with tabs, hooks, and offer cards.

### Phase 5: Claim & Offer Modals

Claim modal (PoW + application text) and create offer modal (PoW + params).

### Phase 6: Banner & Navigation Updates

Actionable banner, sidebar link with badge, route in App.tsx.

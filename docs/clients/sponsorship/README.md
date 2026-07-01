# Sponsorship Features Across Swimchain Clients

> Audit date: 2026-02-17
> Sponsorship-Owner: Cross-client sponsorship feature documentation

## Overview

The sponsorship system allows existing sponsored users to create offers that new users can claim, granting them the ability to post content. Sponsors take responsibility for their sponsees. The system uses Ed25519 signatures for authentication and SHA-256 proof-of-work for spam prevention.

---

## Feature Comparison Table

| Feature | forum-client | feed-client | search-client | analytics-client | chat-client | archiver-client | bridge-client |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Sponsorship Page** | Yes | Yes | No | Yes | No | No | No |
| **`/sponsorship` Route** | Yes | Yes | No | Yes | No | No | No |
| **Nav Link** | Yes (sidebar) | Yes (header) | No | Yes (sidebar) | No | No | No |
| **Browse Offers** | Yes | Yes | No | Yes (read-only) | No | No | No |
| **Claim Offer (PoW)** | Yes | Yes | No | No | No | No | No |
| **Create Offer** | Yes | Yes | No | No | No | No | No |
| **Approve/Reject Claims** | Yes | Yes | No | No | No | No | No |
| **Cancel Offer** | Yes | Yes | No | No | No | No | No |
| **List My Offers** | Yes | Yes | No | No | No | No | No |
| **Sponsorship Status** | Yes | Yes | No | No | No | No | No |
| **Unsponsored Banner** | Yes | Yes | No | No | No | No | No |
| **Pending Claim Notice** | Yes | Yes | No | No | No | No | No |
| **Sponsored Badge** | No | No | Yes | No | No | No | No |
| **Analytics Dashboard** | No | No | No | Yes | No | No | No |
| **Auto-polling (30s)** | Yes | Yes | No | No | No | No | No |
| **useSponsorship Hook** | Yes | Yes | No | No | No | No | No |
| **useMySponsorshipOffers** | Yes | Yes | No | No | No | No | No |
| **useSponsorshipOffers** | Yes | Yes | No | No | No | No | No |
| **RPC: get_sponsorship_info** | Yes | Yes | No | No | No | No | No |
| **RPC: list_sponsorship_offers** | Yes | Yes | No | Yes | No | No | No |
| **RPC: claim_sponsorship_offer** | Yes | Yes | No | No | No | No | No |
| **RPC: create_sponsorship_offer** | Yes | Yes | No | No | No | No | No |
| **RPC: approve_sponsorship_claim** | Yes | Yes | No | No | No | No | No |
| **RPC: reject_sponsorship_claim** | Yes | Yes | No | No | No | No | No |
| **RPC: cancel_sponsorship_offer** | Yes | Yes | No | No | No | No | No |
| **RPC: list_my_sponsorship_offers** | Yes | Yes | No | No | No | No | No |
| **RPC: get_my_claim_status** | Yes | Yes | No | No | No | No | No |
| **RPC: get_sponsorship_offer** | Yes | Yes | No | No | No | No | No |

---

## Screenshots

### forum-client (port 5173)
![forum-client sponsorship](forum-client.png)
*The `/sponsorship` route renders a 3-tab page: "Get Sponsored" (shown), "Sponsor Others", and "My Status". The orange "Your identity is not sponsored" banner appears at the top. The "Get Sponsored" tab shows the 4-step guide, user's public key, and lists available offers (or "No open offers to claim" message). Sidebar shows spaces and a "Get Sponsored" link.*

### feed-client (port 5179)
![feed-client sponsorship](feed-client.png)
*Header shows "Sponsorship" nav link. The `/sponsorship` route is wrapped in `RequireIdentity`, so users are redirected to the identity page if no keypair is loaded. Once identity is set, the page renders a 3-tab interface identical to forum-client.*

### search-client (port 5174)
![search-client sponsorship](search-client.png)
*Search interface with no `/sponsorship` route. Sponsorship is present only as a `SponsoredBadge` component rendered on search result cards when content has a `sponsorshipId` field.*

### analytics-client (port 5178)
![analytics-client sponsorship](analytics-client.png)
*The `/sponsorship` route renders a read-only analytics dashboard with offer metrics, slot utilization bars, type breakdowns, and an active offers table. Requires WASM modules to load first.*

### chat-client (port 5175)
![chat-client sponsorship](chat-client.png)
*No `/sponsorship` route exists. Navigating there shows the Identity page. Zero sponsorship code in the codebase.*

### archiver-client (port 5177)
![archiver-client sponsorship](archiver-client.png)
*No `/sponsorship` route exists. Zero sponsorship code in the codebase. Content preservation tool.*

### bridge-client (port 5176)
![bridge-client sponsorship](bridge-client.png)
*No `/sponsorship` route exists. Zero sponsorship code in the codebase. Cross-platform bridge tool.*

---

## Detailed Client Descriptions

### 1. forum-client (Full Implementation)

**Port:** 5173
**Status:** Complete
**Files:**

| File | Purpose |
|------|---------|
| `src/pages/Sponsorship.tsx` | Main 3-tab sponsorship page |
| `src/pages/Sponsorship.css` | Page styles |
| `src/hooks/useSponsorship.tsx` | Context provider with status polling |
| `src/hooks/useSponsorshipOffers.ts` | Browse public offers with pagination |
| `src/hooks/useMySponsorshipOffers.ts` | Manage sponsor's own offers |
| `src/components/SponsorshipOfferCard.tsx` | Offer card with claim/manage buttons |
| `src/components/SponsorshipBanner.tsx` | Sticky banner for unsponsored users |
| `src/components/SponsorshipStatus.tsx` | Status display (depth, probation, penalty) |
| `src/components/ClaimOfferModal.tsx` | Claim modal with SHA-256 PoW mining |
| `src/components/CreateOfferModal.tsx` | Create offer form (type, slots, expiry) |

**Tab 1: "Get Sponsored"**
- "How Sponsorship Works" 4-step guide
- User's public key displayed with copy button
- Browse paginated public offers (20 per page, own offers filtered out)
- "Claim This Offer" button opens ClaimOfferModal
- Pending claim notice banner shown if user has an active claim awaiting review
- Loading, error, and empty states handled

**Tab 2: "Sponsor Others"**
- List of offers created by the user (signed auth required)
- Pending claims count badge on tab
- "View Claims" button per offer — shows pending claims with claimant pubkey, timestamp, application text
- Approve / Reject buttons for each claim (signed actions with confirmation)
- "Create Offer" button — type (open/probationary), slots (1-10), expiry (1-365 days), min PoW difficulty, application-required toggle
- "Cancel Offer" with confirmation dialog (signed action)
- Refresh button, auto-polls every 30s
- Detail error handling (Issue #53 fix): shows error banner if getOfferDetail() fails

**Tab 3: "My Status"**
- Sponsorship status: Active / Not sponsored
- If sponsored: sponsor pubkey (abbreviated), depth, probation (180-day trial), penalty status, genesis identity flag, sponsorship creation date
- If not sponsored: public key with copy button and sharing instructions

**UI indicators:**
- Orange banner at top: "Your identity is not sponsored" with "Find a Sponsor" CTA
- Sidebar "Get Sponsored" link
- Sidebar badge showing pending claims count
- Status bar: sync status, peer count, storage usage

**RPC Methods:** All 10 sponsorship RPC methods.

---

### 2. feed-client (Full Implementation)

**Port:** 5179
**Status:** Complete
**Files:** Same structure as forum-client:

| File | Purpose |
|------|---------|
| `src/pages/Sponsorship.tsx` | Main 3-tab sponsorship page |
| `src/hooks/useSponsorship.tsx` | Context provider with status polling |
| `src/hooks/useSponsorshipOffers.ts` | Browse public offers |
| `src/hooks/useMySponsorshipOffers.ts` | Manage sponsor's offers |
| `src/components/SponsorshipOfferCard.tsx` | Offer card |
| `src/components/SponsorshipBanner.tsx` | Unsponsored user banner |
| `src/components/SponsorshipStatus.tsx` | Status display |
| `src/components/ClaimOfferModal.tsx` | Claim with PoW |
| `src/components/CreateOfferModal.tsx` | Create offer form |

**Capabilities:** Identical to forum-client. Full lifecycle support for both sponsors and claimants.

**Key difference from forum-client:**
- Uses `useStoredKeypair()` for signing (synchronous `sign()`) instead of forum-client's `useSign()` (async)
- Route is identity-gated via `RequireIdentity` — user must have a keypair before accessing `/sponsorship`
- "Sponsorship" nav link in header bar and mobile nav

**RPC Methods:** All 10 sponsorship RPC methods.

---

### 3. search-client (Badge Only)

**Port:** 5174
**Status:** Partial (display only)
**Files:**

| File | Purpose |
|------|---------|
| `src/components/SponsoredBadge.tsx` | Memoized badge with heart icon |
| `src/components/ResultCard/ResultCard.css` | Badge styles (green) |
| `src/components/ResultCard/ThreadResult.tsx` | Renders badge when `sponsorshipId` present |
| `src/components/ResultCard/ReplyResult.tsx` | Renders badge when `sponsorshipId` present |
| `src/types/index.ts` | `sponsorshipId?: string` on ThreadInfo/ReplyInfo |

**Capabilities:** Shows a green "Sponsored" badge with heart icon on search result cards when content was posted via a sponsorship offer. No sponsorship management, no sponsorship page.

**RPC Methods:** None (sponsorship data comes from search result payloads).

---

### 4. analytics-client (Read-Only Dashboard)

**Port:** 5178
**Status:** Partial (analytics only)
**Files:**

| File | Purpose |
|------|---------|
| `src/pages/SponsorshipAnalytics.tsx` | Analytics dashboard |
| `src/pages/SponsorshipAnalytics.css` | Dashboard styles |
| `src/lib/rpc.ts` | `listSponsorshipOffers()` method + types |

**Dashboard shows:**
- Metric cards: active offers, total slots, claimed slots, available slots
- Slot utilization progress bar with percentage
- Offer type breakdown (probationary/open/conditional counts)
- Requirements summary (application-required count, PoW-required count, avg slots/offer)
- Active offers table with columns: sponsor, type, slots, remaining, expiry, PoW difficulty, app required
- Refresh button (manual reload, no auto-polling)

**Limitations:** Read-only. No ability to create, claim, approve, or reject.

**RPC Methods:** `list_sponsorship_offers` only.

---

### 5. chat-client (Not Implemented)

**Port:** 5175
**Status:** Not implemented
**Files:** Zero sponsorship-related files.

Discord-style real-time messaging client focused on channels, servers, typing indicators, and presence. No sponsorship route, hooks, components, or RPC methods.

**Note:** This is the most critical gap. As a social client where users post content, unsponsored users should ideally be gated or warned. Currently relies entirely on node-level RPC enforcement.

---

### 6. archiver-client (Not Implemented)

**Port:** 5177
**Status:** Not implemented
**Files:** Zero sponsorship-related files.

Content preservation tool focused on monitoring at-risk content, auto-engagement, and archival. Sponsorship gating is less critical since the tool extends content lifetime rather than creating new content.

---

### 7. bridge-client (Not Implemented)

**Port:** 5176
**Status:** Not implemented
**Files:** Zero sponsorship-related files.

Cross-platform bridging tool for Matrix and IRC protocols. Focused on protocol translation, rate limiting, and echo tracking. Sponsorship is handled at the node level for bridged content.

---

## Known Issues and Gaps

| # | Client | Severity | Issue | Status |
|---|--------|:--------:|-------|:------:|
| 1 | chat-client | HIGH | Social client where users post content has zero sponsorship features | Open |
| 2 | forum-client | FIXED | `getOfferDetail()` returned null silently on failure (Issue #53) | Fixed |
| 3 | analytics-client | LOW | Only reads offer listings; no per-identity status or trends | Open |
| 4 | search-client | LOW | Badge shows if `sponsorshipId` present; cannot verify sponsorship is current | Open |
| 5 | archiver-client | INFO | Status indicator would be useful but not critical | Open |
| 6 | bridge-client | INFO | Bridged content should carry sponsorship metadata | Open |

---

## Sponsorship RPC Methods Reference

| Method | Auth | Description |
|--------|:----:|-------------|
| `get_sponsorship_info` | No | Check if an identity is sponsored. Returns depth, probation, penalty status. |
| `list_sponsorship_offers` | No | Browse public offers with pagination and type filtering. |
| `get_sponsorship_offer` | No | Get offer details including pending claims list. |
| `create_sponsorship_offer` | Sig | Create a new offer (type, slots, expiry, min PoW, app required). |
| `claim_sponsorship_offer` | Sig+PoW | Claim an offer with proof-of-work and optional application text. |
| `approve_sponsorship_claim` | Sig | Sponsor approves a pending claim, creating on-chain sponsorship. |
| `reject_sponsorship_claim` | Sig | Sponsor rejects a pending claim. |
| `cancel_sponsorship_offer` | Sig | Sponsor cancels offer, removing all pending claims. |
| `list_my_sponsorship_offers` | Sig | List offers created by the current sponsor (requires signature). |
| `get_my_claim_status` | No | Check if the current user has a pending claim awaiting review. |

---

## Architecture Notes

### Sponsorship State Flow (forum-client & feed-client)

```
App starts
  |
  v
SponsorshipProvider checks identity
  |-- get_sponsorship_info(pubkey)
  |-- If not sponsored: get_my_claim_status(pubkey)
  |-- Stores: isSponsored, sponsorPubkey, detail, pendingClaim
  |
  v
SponsorshipBanner rendered if: hasIdentity AND !isSponsored
  |-- "Find a Sponsor" or "View Status" CTA
  |
  v
User navigates to /sponsorship
  |
  +-- Tab 1: "Get Sponsored"
  |     |-- list_sponsorship_offers(offset, limit)
  |     |-- User clicks "Claim" -> ClaimOfferModal
  |     |-- claim_sponsorship_offer(offerId, pubkey, sig, ts, appText?)
  |
  +-- Tab 2: "Sponsor Others"
  |     |-- list_my_sponsorship_offers(pubkey, sig, ts)
  |     |-- "View Claims" -> get_sponsorship_offer_detail(offerId)
  |     |-- Approve: approve_sponsorship_claim(...)
  |     |-- Reject: reject_sponsorship_claim(...)
  |     |-- Cancel: cancel_sponsorship_offer(...)
  |     |-- Create: submit_sponsorship_offer(...)
  |
  +-- Tab 3: "My Status"
        |-- Displays cached sponsorship info
        |-- If sponsored: depth, probation, penalty, sponsor pubkey
        |-- If not: public key for sharing

Auto-polling: 30s interval when unsponsored or has active offers
```

### Signature Format

All signed actions use Ed25519 signatures with timestamp to prevent replay:

| Operation | Message |
|-----------|---------|
| Claim | `claimant_pubkey(32 bytes) \|\| timestamp(8 bytes BE)` |
| Approve/Reject | `claimant_pubkey(32 bytes) \|\| timestamp(8 bytes BE)` |
| Cancel Offer | `offer_id(16 bytes) \|\| timestamp(8 bytes BE)` |
| List My Offers | `"swimchain-list-offers:" \|\| sponsor_pubkey(32 bytes) \|\| timestamp(8 bytes BE)` |

### Protocol Constants

- **PoW algorithm:** SHA-256 with configurable leading zero bytes (difficulty 0-8)
- **Polling interval:** 30 seconds
- **Offer types:** `open` (full sponsorship), `probationary` (180-day trial)
- **Slots per offer:** 1-10
- **Expiry range:** 1-365 days
- **Application text limit:** 2000 characters
- **Pagination:** 20 offers per page

---

## Changelog

- **2026-02-17:** Initial documentation created with screenshots from all 7 clients.
- **2026-02-17:** Issue #53 fixed — `getOfferDetail()` error handling in forum-client.
- **2026-02-17:** analytics-client SponsorshipAnalytics dashboard added (read-only).
- **2026-02-17:** search-client SponsoredBadge component added (display-only).

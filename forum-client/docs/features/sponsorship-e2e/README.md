# Sponsorship E2E Test Results

**Test Date**: February 5, 2026
**Test Type**: Two-Node Sponsorship Flow
**Status**: **PASSED**

## Overview

This document captures a successful end-to-end sponsorship test between two independent SwimChain nodes. The test validates the complete sponsorship lifecycle:

1. Genesis node creates a sponsorship offer
2. Alpha node discovers and claims the offer
3. Genesis node approves the claim
4. Alpha node becomes SPONSORED

## Test Configuration

| Node | Forum Client | RPC Port | P2P Port | Role |
|------|--------------|----------|----------|------|
| **Genesis** | http://localhost:5173 | 19736 | 19735 | Sponsor (creates offers) |
| **Alpha** | http://localhost:5174 | 19746 | 19745 | Claimant (needs sponsorship) |

### Node Identities

| Node | Identity Address |
|------|------------------|
| Genesis | `cs1qz0vjesa82t4452pe2jal8c5k0zxeae92z08lgzycxwjdlnkh5zzqed2kj7` |
| Alpha | `cs1qp5lpe2qyckk7rr7wqf3hyxsr0a3ln3n9jfzusuzxalagreuz4x72vcqx99` |

---

## Test Results Summary

| Step | Status | Description |
|------|--------|-------------|
| 1a. Genesis Identity | PASS | Identity loaded and displayed |
| 1b. Alpha Identity | PASS | Separate identity loaded |
| 2. Create Offer | PASS | Genesis created sponsorship offer |
| 3. Find Sponsor | PASS | Alpha discovered available offers |
| 4. Claim Offer | PASS | Alpha submitted claim request |
| 5. View Claims | PASS | Genesis saw pending claim |
| 6. Approve Claim | PASS | Genesis approved Alpha's claim |
| 7. Final Status | **PASS** | Alpha now shows SPONSORED status |

**Overall Result: SUCCESS**

---

## Step-by-Step Flow

### Step 1a: Genesis Identity

![Genesis Identity](flow-1a-genesis-identity.png)

Genesis node's identity page showing:
- **Address**: `cs1qz0vjesa82t4452pe2jal8c5k0zxeae92z08lgzycxwjdlnkh5zzqed2kj7`
- **Status**: Ready to sponsor others
- Node status: Synced with testnet peers

---

### Step 1b: Alpha Identity

![Alpha Identity](flow-1b-alpha-identity.png)

Alpha node's identity page showing:
- **Address**: `cs1qp5lpe2qyckk7rr7wqf3hyxsr0a3ln3n9jfzusuzxalagreuz4x72vcqx99`
- **Status**: Not sponsored (needs sponsorship to post)
- Separate identity from Genesis (different keypair)

---

### Step 2: Genesis Creates Sponsorship Offer

![Genesis My Offers](flow-2-genesis-my-offers.png)

Genesis navigates to "My Offers" tab and creates a sponsorship offer:
- **Offer Type**: Probationary (recommended)
- **Slots**: 1 available
- **Expires**: Configurable (default 7 days)
- Offer is broadcast to the network

---

### Step 3: Alpha Finds Available Offers

![Alpha Find Sponsor](flow-3-alpha-find-sponsor.png)

Alpha navigates to "Find Sponsor" tab and sees:
- Available sponsorship offers from the network
- Genesis's offer appears in the list
- Shows sponsor address, slots remaining, and offer details

---

### Step 4: Alpha Claims the Offer

![Alpha Claim Modal](flow-4-alpha-claim-modal.png)

Alpha clicks "Claim" on Genesis's offer:
- Claim modal appears with offer details
- Alpha can add an optional message
- Proof-of-work is computed to prevent spam
- Claim is submitted to the network

---

### Step 5: Alpha After Claim Submitted

![Alpha After Claim](flow-5-alpha-after-claim.png)

After submitting the claim:
- UI shows claim is pending
- Alpha waits for Genesis to approve
- Status shows "Pending Approval"

---

### Step 6: Genesis Views Pending Claims

![Genesis View Claims](flow-6-genesis-view-claims.png)

Genesis goes to "View Claims" for their offer:
- Alpha's claim appears in the pending list
- Shows claimant's address
- "Approve" and "Reject" buttons available

---

### Step 6b: Genesis Clicks Approve

![After Approve Click](flow-6b-after-approve-click.png)

Genesis clicks the "Approve" button:
- Approval transaction is created
- Proof-of-work is computed
- Transaction broadcast to network

---

### Step 7: Genesis After Approval Complete

![Genesis After Approve](flow-7-genesis-after-approve.png)

After approval completes:
- Claim status changes to "Approved"
- Slot count decremented on the offer
- Sponsorship relationship is now on-chain

---

### Step 8: Alpha Final Status - SPONSORED!

![Alpha Final Status](flow-8-alpha-final-status.png)

Alpha's identity page now shows:
- **Status**: SPONSORED
- **Sponsor**: Genesis's address
- Alpha can now create content on the network
- Full posting privileges enabled

---

## Technical Details

### Network Synchronization

The sponsorship flow relies on proper network sync between nodes:

1. **Offer Creation** (Genesis)
   - Creates `SponsorshipOffer` action
   - Computes PoW with difficulty based on offer slots
   - Action propagates to connected peers

2. **Offer Discovery** (Alpha)
   - Receives offer via P2P gossip
   - Indexes in local storage
   - Appears in "Find Sponsor" UI

3. **Claim Submission** (Alpha)
   - Creates `SponsorshipClaim` action
   - References offer ID
   - Propagates to Genesis node

4. **Claim Approval** (Genesis)
   - Creates `SponsorshipApproval` action
   - References claim ID
   - Propagates to Alpha and network

5. **Status Update** (Alpha)
   - Receives approval action
   - Updates local sponsorship status
   - UI reflects SPONSORED state

### RPC Methods Used

| Method | Node | Purpose |
|--------|------|---------|
| `get_identity` | Both | Get node's identity info |
| `get_sponsorship_status` | Alpha | Check if sponsored |
| `list_sponsorship_offers` | Alpha | Find available offers |
| `create_sponsorship_offer` | Genesis | Create new offer |
| `claim_sponsorship` | Alpha | Submit claim |
| `list_pending_claims` | Genesis | View claims to approve |
| `approve_sponsorship_claim` | Genesis | Approve a claim |

---

## Key Validations

### Cryptographic Verification

- Each identity uses unique Ed25519 keypair
- Addresses are Bech32m-encoded public keys
- All actions are signed by originating identity
- PoW prevents spam across all operations

### Two-Node Independence

- Genesis and Alpha run on different ports
- Separate data directories (`genesis-testnet/` vs `alpha-testnet/`)
- Independent localStorage in browser
- Network discovery via testnet peers

### Sponsorship Constraints

- Sponsor must have available slots
- Claimant must not already be sponsored
- One sponsor per identity at a time
- Sponsorship recorded in blockchain

---

## Previous Test Issues (Now Resolved)

Earlier test attempts failed due to:

| Issue | Resolution |
|-------|------------|
| Alpha blank page | Pre-seeded Alpha identity in localStorage |
| Separate browser contexts | Used proper Puppeteer context isolation |
| Network sync delay | Added proper wait conditions |

The successful test demonstrates that when both nodes have valid identities and proper network connectivity, the full sponsorship flow works correctly.

---

## Test Script

The test was run using:

```bash
node forum-client/sponsorship-e2e-v2.cjs
```

### Test Automation Features

- Puppeteer for browser automation
- Separate browser contexts for Genesis/Alpha
- Screenshot capture at each step
- Automatic identity initialization
- Proper wait conditions for network sync

---

## Files in This Directory

| File | Description |
|------|-------------|
| `README.md` | This documentation |
| `flow-1a-genesis-identity.png` | Genesis identity page |
| `flow-1b-alpha-identity.png` | Alpha identity page |
| `flow-2-genesis-my-offers.png` | Genesis creating offer |
| `flow-3-alpha-find-sponsor.png` | Alpha finding offers |
| `flow-4-alpha-claim-modal.png` | Alpha claiming offer |
| `flow-5-alpha-after-claim.png` | Alpha after claim submitted |
| `flow-6-genesis-view-claims.png` | Genesis viewing claims |
| `flow-6b-after-approve-click.png` | Genesis approve click |
| `flow-7-genesis-after-approve.png` | Genesis after approval |
| `flow-8-alpha-final-status.png` | Alpha SPONSORED status |

---

## Conclusion

The two-node sponsorship E2E test **PASSED**, validating that:

1. Sponsorship offers propagate between nodes
2. Claims can be submitted across the network
3. Approvals are properly synchronized
4. Status updates reflect in the UI

This demonstrates the core decentralized sponsorship system is working correctly in a multi-node environment.

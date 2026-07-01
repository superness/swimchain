# Agent Testing Guide

Lessons learned from UI testing with chat agents.

## The Problem

AI agents will "solve problems" instead of testing. When they hit an issue, they hack around it with curl, RPC calls, or CLI commands - completely bypassing the UI they're supposed to test. This defeats the purpose.

## Rules for Test Agents

### 1. You Are a Tester, Not a Fixer

- Use ONLY the UI you're testing
- When something doesn't work, REPORT it and STOP
- DO NOT hack around issues
- DO NOT use curl, RPC, or CLI as workarounds

### 2. Check Basic Connectivity First

Before reporting any feature bugs, verify:
- Is the forum-client running?
- Does the status bar show "Synced" or "Offline"?
- Are there peers connected?
- Is identity loaded?

**"Offline" means not connected - that's not a feature bug, it's a setup issue.**

### 3. Wait for Connections

- Browser automation starts with fresh state
- RPC connections take time to establish
- Wait 5-10 seconds after page load before testing
- Re-check status before claiming something is broken

### 4. Use Persistent Browser Profiles

```bash
# Genesis profile
--user-data-dir=/tmp/swimchain-agents/genesis/browser-profile

# Alpha profile
--user-data-dir=/tmp/swimchain-agents/alpha/browser-profile
```

Without this, identity is lost between Puppeteer sessions.

### 5. Evidence for Every Claim

Every bug report needs:
- Screenshot showing the issue
- Exact steps to reproduce
- Console errors (if any)
- Network requests showing what API calls were made

Don't claim "API not called" if you're not even connected.

## Rules for Orchestrator (Main Claude)

### 1. Don't Accept Reports at Face Value

When an agent says "Bug found!", check:
- Is the client connected? (look at status bar)
- Is identity loaded?
- Did they actually use the UI or hack around it?

### 2. Ask Clarifying Questions

Before accepting a bug report:
- "Is the status bar showing Synced or Offline?"
- "What does the console show?"
- "Can you make ANY RPC call successfully?"

### 3. Work Slowly

- One instruction at a time
- Wait for response before next step
- Don't send complex multi-step instructions

### 4. Be the Smart One

The agents are "babies" - they need guidance. If their report doesn't make sense, push back. Don't just accept it.

## Test Environment Setup

Before testing any UI flow:

1. **Start services**
   - Genesis node running on 19735/19736
   - Alpha node running on 19745/19746
   - Forum-client on 5173 (genesis) and 5174 (alpha)

2. **Verify connections**
   - Each forum-client shows "Synced" with peers
   - Identity is loaded (not "No Node Identity")

3. **Set up persistent profiles**
   - Import identities to browser profiles
   - Verify identity persists between sessions

4. **Only then test features**

## Common Mistakes

| Mistake | Reality |
|---------|---------|
| "API not called" | Client wasn't connected |
| "Bug: no offers showing" | Timing issue - connection not established |
| "Authentication error" | No identity in browser |
| "Offers don't sync" | Correct - offers are local to node that created them |

## The Sponsorship Test Flow

Correct way to test:

1. **Genesis**: Navigate to /sponsorship, verify connected, check My Offers tab
2. **Alpha**: Navigate to /sponsorship with persistent profile, verify connected, check Find a Sponsor tab
3. **Alpha**: Click Claim on an offer, fill form, submit
4. **Genesis**: Check My Offers, click View Claims, see alpha's claim
5. **Genesis**: Approve the claim
6. **Alpha**: Check My Status, verify sponsored

Each step: screenshot, verify connectivity, report what you see.

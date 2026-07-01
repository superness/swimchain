# Website Specification - User Perspective Reviews

This document reviews the website specification from multiple user perspectives to identify gaps, confusion points, and opportunities for the "WOW" experience.

---

## Review 1: "Frustrated Social Media User"

**Profile:**
- 28-year-old professional
- Uses Instagram, Twitter, TikTok daily
- Knows they're addicted, feels guilty about it
- Not technical at all
- Has heard "delete social media" advice, hasn't done it

**First Visit Experience:**

### What Would Hook Them:
```
"Social media that literally cannot show you ads."

REACTION: "Wait, what? How is that even possible?"
```
This is the exact curiosity hook we need. The word "cannot" is key - not "won't" (promises are cheap) but "cannot" (structurally impossible).

### Where They'd Get Confused:
- "Runs on your computer" - They'll think "like installing Photoshop?"
- "No password reset" - This will scare them. A LOT.
- "Takes 30 seconds to post" - They'll think something is broken

### What Would Make Them Leave:
- Any mention of blockchain, crypto, Web3
- Technical diagrams
- Feeling like this is for "nerds only"
- Realizing they can't use it on their phone (yet)

### The "WOW" Moment:
```
"Old drama fades away"
```
This hits emotionally. Everyone has embarrassing old posts. The idea that content naturally expires is genuinely novel and appealing.

### Suggested Improvements:
1. **Add a "What if..." framing:**
   "What if that embarrassing post from 2019 just... disappeared?"

2. **Address the phone issue immediately:**
   "Currently desktop only. Mobile is coming. We know. We're working on it."

3. **Make the 30-second thing feel like a feature, not a bug:**
   "You know that feeling when you tweet something stupid? Here, you have 30 seconds to reconsider."

---

## Review 2: "Tech-Savvy Skeptic"

**Profile:**
- 35-year-old software developer
- Has tried Mastodon, knows about Bluesky
- Cynical about "decentralized" claims
- Will immediately check GitHub
- Knows enough to spot bullshit

**First Visit Experience:**

### What Would Hook Them:
```
"Like BitTorrent, but for social media."
```
Perfect analogy. They understand BitTorrent works. They understand there's no "BitTorrent company" running servers. This lands.

### Where They'd Be Skeptical:
- "No company at all" - They'll wonder about DNS, seed nodes, bootstrap problem
- Spam prevention claims - "How is 30 seconds enough?"
- "Cannot show ads" - "Someone could still embed ads in content"

### What Would Earn Their Trust:
- Seeing actual source code
- Seeing test coverage (1000+ tests!)
- Seeing the specs are well-thought-out
- Recognizing the team isn't promising the moon

### The "WOW" Moment:
```
The architecture - Bitcoin for authority, BitTorrent for content.
```
They'll appreciate the hybrid design. It's clever. It solves real problems. It's not just "blockchain everything."

### What Would Make Them Leave:
- Vaporware vibes (promises without code)
- Token/coin announcement
- VC funding announcement
- Claims that are technically impossible

### Suggested Improvements:
1. **Link to GitHub prominently:**
   "Don't trust us. Read the code. 52,000+ lines, 1000+ tests."

2. **Add a "How we solve X" section:**
   Brief technical explanations for common attack vectors.

3. **Acknowledge bootstrap problem:**
   "Yes, you need to find peers initially. Here's how that works."

---

## Review 3: "Privacy Advocate"

**Profile:**
- Uses Signal, Tor, Firefox with uBlock
- Deleted Facebook years ago
- Skeptical of anything that requires an account
- Thinks most "privacy" products are theater

**First Visit Experience:**

### What Would Hook Them:
```
"There's no server to log your activity."
```
Not "we don't log" (policy) but "there's no server" (architecture). This is the key distinction.

### Where They'd Probe:
- "What metadata exists?" (connections between users, timing, etc.)
- "What's stored locally?" (can someone seize my device and see everything?)
- "How is identity handled?" (is my key fingerprint linkable across contexts?)
- "What about traffic analysis?" (can observers see who I'm talking to?)

### The "WOW" Moment:
```
"No database for hackers to steal."
```
Every week there's another data breach. The idea that there's simply no central honeypot is appealing.

### What Would Concern Them:
- Social graph is still visible (who follows who)
- Content is public (even if ephemeral)
- Device storage could be seized
- Traffic analysis still possible

### Suggested Improvements:
1. **Add a "Privacy Model" section:**
   Be explicit about what IS and ISN'T private.

2. **Threat model transparency:**
   "We protect against X, Y, Z. We do NOT protect against A, B, C."

3. **Acknowledge limitations:**
   "This is better than Twitter, not better than Tor."

---

## Review 4: "Community Moderator"

**Profile:**
- Runs a Discord server or subreddit
- Deals with trolls, spam, harassment daily
- Tired of platform tools being inadequate
- Wants control but also wants help

**First Visit Experience:**

### What Would Hook Them:
```
"Communities can fork—split off with their content and history."
```
This is HUGE for community leaders. No more "Reddit changed the API and killed our community." No more "Discord banned our server." You OWN your space.

### Where They'd Be Skeptical:
- "Who moderates?" - No mods = chaos?
- "Content fades away" - What about important posts?
- "No platform support" - Who do I contact when something goes wrong?

### What Would Concern Them:
- Harassment tools seem unclear
- No "ban user" equivalent visible
- No "delete post" option
- What happens when bad actors target their community?

### The "WOW" Moment:
```
"Fork and leave."
```
The nuclear option exists. If someone hostile takes over or if there's an irreconcilable split, you can fork. Nobody can stop you.

### Suggested Improvements:
1. **Add "For Community Leaders" section:**
   Explain space creation, moderation approach, fork mechanics.

2. **Address harassment directly:**
   "Here's how communities handle bad actors without central authority."

3. **Explain the pinning/engagement economy:**
   "Important posts stay alive because your community keeps them alive."

---

## Review 5: "Journalist / Public Figure"

**Profile:**
- Has a following, needs to reach people
- Has been burned by platforms (shadowbans, suspensions)
- Worried about censorship
- Needs verification/credibility

**First Visit Experience:**

### What Would Hook Them:
```
"No platform can ban you."
```
This is HUGE for anyone who's been deplatformed or worried about it. There's simply no one with that power.

### Where They'd Be Skeptical:
- "How do people find me?" (no algorithm means no discovery)
- "How do I prove I'm really me?" (no verification badge)
- "How do I reach new people?" (no viral mechanics)

### What Would Concern Them:
- Reach will be much smaller
- No verification system
- Impersonation is easier
- Their content will fade away

### The "WOW" Moment:
```
"Your archive can't be deleted by anyone."
```
The idea that their record exists on a network they don't control, but also that no one else controls, is appealing.

### Reality Check:
This platform is probably NOT for people who need mass reach. Be honest:
"This is for conversations, not broadcasts. If you need to reach millions, Twitter still works. If you want real discussions without manipulation, this is for you."

### Suggested Improvements:
1. **Be honest about reach:**
   "You won't go viral here. That's on purpose."

2. **Explain portable identity:**
   "Your key IS your identity. Take it anywhere. No platform can take it away."

3. **Address verification:**
   "There's no blue check. Identity is proven through consistent key usage, not platform blessing."

---

## Review 6: "Crypto-Skeptic"

**Profile:**
- Associates "blockchain" with scams, NFT bros, speculation
- Has seen too many "decentralized" projects rug pull
- Deeply skeptical of anything that sounds like tech hype
- May have lost money to crypto

**First Visit Experience:**

### What Would IMMEDIATELY Turn Them Off:
- Any mention of "blockchain"
- Any hint of tokens/coins
- "Web3" anywhere
- Promises of "ownership" or "earning"
- Jargon-heavy explanations

### What Would Hook Them:
```
"No coin. No token. No investment opportunity. Just... talking."
```
The explicit rejection of crypto financialization is key. This is NOT that.

### Where They'd Be Skeptical:
- "Is proof of work the same as Bitcoin mining?"
- "Are they going to add a token later?"
- "Is this just pre-revenue?"

### The "WOW" Moment:
```
"We use the same technology as Bitcoin—for spam prevention, not speculation.
There's nothing to buy, sell, or trade. The tech is good. The culture isn't."
```

### Suggested Improvements:
1. **Add explicit anti-crypto messaging:**
   "This is not a cryptocurrency. There is no token. There never will be."

2. **Explain PoW without calling it that:**
   "Your computer does some math. This proves you're not a bot."

3. **Distance from crypto culture:**
   "We borrowed the useful ideas. We left the speculation behind."

---

## Review 7: "Busy Parent / Casual User"

**Profile:**
- Uses social media to keep up with friends and family
- Doesn't have time for complicated tech
- Wants something that "just works"
- Values convenience over privacy

**First Visit Experience:**

### Immediate Reaction:
```
"This sounds like a lot of work."
```
And they're right. This IS more work than opening Instagram.

### What Would Hook Them:
```
"No ads. No algorithm pushing things at you."
```
They know the algorithm is bad. They feel it. But is the trade-off worth it?

### Reality Check:
**This person is probably NOT our user.** Be honest about that.

```
WHO THIS ISN'T FOR:
• People who want something that "just works"
• People who don't want to think about technology
• People who primarily consume rather than participate
• People who need to reach lots of people easily
```

### The "WOW" Moment (if they stick around):
```
"Your kids can't see your old posts because they naturally disappeared."
```
The decay mechanic actually solves a problem they have.

### Suggested Improvements:
1. **Don't try to appeal to everyone:**
   Be clear this requires commitment.

2. **But acknowledge future path:**
   "Right now, this is for technical early adopters. We're working on making it easier."

3. **Show the payoff:**
   "It's more effort. But you're not being manipulated. You choose what you see."

---

## Summary: Cross-Review Insights

### Universal Hooks (Everyone Responds To):
1. "Cannot show you ads" (not "won't" - "cannot")
2. "Old posts fade away"
3. "No company to sell your data"
4. "Fork and leave with your community"

### Universal Concerns:
1. Seems complicated / technical
2. What about my phone?
3. What happens if I lose my key?
4. Is this a crypto thing?

### The Essential Trade-off Story:
```
What you give up:
• Convenience
• Viral potential
• Password reset
• Phone app (for now)
• Casual browsing

What you get:
• No manipulation
• No ads
• No platform control
• Content that fades
• Real ownership
```

### Segments to Serve vs. Acknowledge:

**Primary audience (serve them well):**
- Tech-savvy people tired of platforms
- Privacy advocates
- Community builders who want control
- People burned by deplatforming

**Secondary audience (welcome but don't optimize for):**
- Curious mainstream users
- Journalists looking for backup
- Open source enthusiasts

**Explicitly not our audience (be honest):**
- Passive consumers
- People who need mass reach
- People who want "just works" convenience
- Crypto speculators

---

## Final Recommendation

The website specification is strong. The key improvements needed:

1. **Lead with emotion, not technology**
   - The problem (manipulation, addiction, control)
   - The feeling (freedom, authenticity, ownership)
   - THEN the mechanism (only for the curious)

2. **Address the crypto elephant immediately**
   - Explicit: "This is not crypto. No token. Ever."
   - Borrow the tech, reject the culture

3. **Be honest about who this ISN'T for**
   - Don't try to be for everyone
   - Clear "this isn't for you if..." section

4. **The "WOW" experience comes from:**
   - "Cannot" not "won't" (structural not policy)
   - "Fork and leave" (escape route exists)
   - "Content fades" (no haunting old posts)
   - "No one to pressure" (true independence)

5. **Mobile is the elephant in the room**
   - Acknowledge it immediately
   - "Desktop for now. Mobile coming. We know."

---

*Review completed: 2025-12-26*
*Purpose: Identify gaps and opportunities in website specification*
*Method: User persona analysis from 7 distinct perspectives*

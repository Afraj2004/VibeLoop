# VibeLoop Project Specification

## Brand Identity
- **Name:** VibeLoop
- **In-App Currency:** VIBE Tokens (Meet-to-Earn system, daily cap 10 VIBE)
- **Palette:** Obsidian Core (#08090D), Slate Glass (#12151E), Hyper-Cyan (#00F0FF), Sunset Orchid (#FF2A7A), Ultra Purple (#7B2CBF), Champagne Gold (#FFD166).

## Stack
- **Backend:** Node.js, Express, Socket.IO, Redis (atomic Lua script queues for matchmaking).
- **Frontend:** React, Vite, Tailwind CSS, WebRTC native APIs.
- **Rules:** 
  - Matchmaking supports country and gender filters.
  - 20-second minimum call duration before adding peers to Recent History.
  - Ephemeral direct messaging capped at 30 messages.
  - Full-bleed video stage with picture-in-picture local preview and glassmorphic HUD.

## Current Files
- `server.js` (Signaling & WebRTC handler)
- `matchmaker.js` (Redis queues)
- `src/useVibeWebRTC.js` (Client hook)
- `src/App.jsx` (UI Video Stage)



Now that **VibeLoop’s** brand identity, visual style, and color system are locked down, the next step is defining the **Core Information Architecture & Screen Flow**, followed by the **Database Schema & Token Economy Engine**.

---

### Phase 1: Complete App Screen Flow & Information Architecture

From the user flows visible in the product audit, the app divides into three core layers: **The Discovery Engine (Live Cam Stage)**, **The Social Retention Layer (History, Chat, Profiles)**, and **The Monetization Engine (Boosts, Gifting, Wallet)**.

```
                        ┌────────────────────────┐
                        │   VibeLoop Landing     │
                        │ (Permission & Terms)   │
                        └───────────┬────────────┘
                                    │
                        ┌───────────▼────────────┐
                        │   Live Video Stage     │◄───────────────────┐
                        │  (Edge-to-Edge View)   │                    │
                        └─────┬───────┬────────┬─┘                    │
          ┌───────────────────┘       │        └──────────────────┐   │
          ▼                           ▼                           ▼   │
┌──────────────────┐        ┌──────────────────┐        ┌─────────────┴──────┐
│  Matchmaking HUD │        │  In-Call Actions │        │ Post-Match Drawer  │
├──────────────────┤        ├──────────────────┤        ├────────────────────┤
│ • Country Filter │        │ • Text Chat (30m)│        │ • Connection Bar   │
│ • Gender Filter  │        │ • Live Gift Tray │        │   (>20s matches)   │
│ • VibeBoost Mod. │        │ • Like/Heart Tap │        │ • Add Friend Req.  │
│ • VIBE Balance   │        │ • Next / Skip    │        │ • Open Messenger   │
└──────────────────┘        └──────────────────┘        └────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
   ┌──────────────────────┐                       ┌──────────────────────┐
   │   User Profile / Hub │                       │    Leaderboard &     │
   ├──────────────────────┤                       │     Achievements     │
   ├──────────────────────┤                       ├──────────────────────┤
   │ • Wallet & Refill    │                       │ • Monthly Top Ranks  │
   │ • Match Statistics   │                       │ • Badges & Rewards   │
   │ • Privacy Controls   │                       │ • Claim Free VIBE    │
   └──────────────────────┘                       └──────────────────────┘

```

---

### Phase 2: Screen-by-Screen UX & Technical Blueprint

#### Screen 1: The Live Video Stage (The Core Experience)

* **Viewports:**
* **Remote Stream:** Full-bleed background video canvas (using CSS `object-fit: cover`).
* **Self Stream (PIP):** Draggable, rounded glassmorphic preview box in the top/bottom corner with a tap-to-flip/mirror control.


* **Floating Header Bar:**
* Left: Brand mark (`VibeLoop`).
* Center: Live online peer counter (e.g., `1.4k Online`).
* Right: Wallet pill showing current balance (e.g., `💎 8.65 VIBE`) with a quick tap to open the refill drawer.




* **Match Control Bar (Bottom Float):**
* **Country Selector Pill:** Defaults to "All", opens bottom drawer with flags and regional filters.


* **Gender Selection Pill:** Locked by default until the threshold is met or purchased.


* **Next Button:** Primary neon-glow button to emit `leave_room` and `find_match` over WebSockets.


* **Text/Gift Triggers:** Toggles overlay chat and 3D micro-gifting tray.





#### Screen 2: Gamified Boost & Filter Modal

* **The "Meet-to-Earn" Tracker:**
* A progress bar showing: *"Earned today: 6/10 VIBE"* (Caps farming bots at 10 VIBE/day).


* Unlocking threshold tracker: *"Reach 30 VIBE or refill instantly to unlock Gender Selection"*.




* **VibeBoost Card:**
* Cost: 10 VIBE for a 1-hour session.


* Perks: Verified badge in chat, higher matchmaking priority in the target gender pool, and gender tags visible on incoming profiles.





#### Screen 3: Social Retention Drawer (Post-Match & Messenger)

* **20-Second History Rule:** The system starts a client-side timer upon peer connection. If the call exceeds 20 seconds, the peer's user ID and avatar are automatically pushed to the user's `Connection History` bar (limited to the last 10 contacts).


* **Ephemeral Private Messenger:**
* Users can send offline messages to peers saved in their history.


* Retention limit: Explicitly enforce privacy by storing only the last 30 messages per conversation, auto-purging older entries.





#### Screen 4: Leaderboard, Levels & Rewards

* **Community Ranks:**
* Points awarded for: Time spent chatting (`+1 pt/min`), gifts received, and friends added.


* Rank Tiers: *Chatter $\rightarrow$ Power User $\rightarrow$ Idol $\rightarrow$ Chart Champion*.




* **Monthly Rewards:** Top 3 users on the leaderboard receive Gold VIP status or token payouts at the end of every calendar month.



---

### Phase 3: Token Economy & Monetization Logic

To avoid hyper-inflation and prevent bot abuse while maintaining high conversion rates:

| Action | Free Inflow | Token Burn / Outflow | Business Rationale |
| --- | --- | --- | --- |
| **Active Video Chat** | +0.10 VIBE / 3 mins | — | Daily cap of 10 VIBE keeps free users engaged without devaluing currency.

 |
| **Gender Filter Active** | — | -2 VIBE / min (or 30 VIBE unlock) | The primary monetization funnel for standard male traffic.

 |
| **1-Hour Match Boost** | — | -10 VIBE flat fee | High-margin instant utility purchase.

 |
| **Micro-Gifts** | Recipient gets 50% cash-out value | Sender spends 1 to 75 VIBE | 50% platform rake on all digital gift transactions.

 |
| **VIP Gold Subscription** | — | $19.99 / month | Ad-free, translation tools, stealth privacy modes, verified ring.

 |

---

### Phase 4: Core Database Architecture (PostgreSQL Schema)

Here are the critical relational tables needed for user state, live sessions, and the token ledger:

```sql
-- Core Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(32) NOT NULL DEFAULT 'Stranger',
    avatar_url TEXT,
    gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
    country_code VARCHAR(2) DEFAULT 'US',
    vibe_balance NUMERIC(10, 2) DEFAULT 0.00,
    rank_points INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    is_vip BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Real-Time Match History (For the 20-second retention rule)
CREATE TABLE match_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    matched_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    duration_seconds INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_recent_match UNIQUE (user_id, matched_user_id, created_at)
);

-- Token Transaction Ledger (Audit trail for all VIBE earnings/spend)
CREATE TABLE token_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL, -- Positive for rewards/purchases, negative for spend
    transaction_type VARCHAR(32) NOT NULL, -- 'chat_reward', 'boost_purchase', 'gift_sent', 'gift_received'
    metadata JSONB, -- stores recipient_id, gift_type, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ephemeral Direct Messages (Capped at 30 messages per pair)
CREATE TABLE direct_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message_text VARCHAR(500) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

```

---

### Next Execution Step

To proceed with engineering, which component would you like to build first?

1. **The Signaling & Queue Engine:** Write the Node.js / Socket.IO server with Redis matchmaking logic (supporting country tags, gender preference, and skip handling).
2. **The React Client Shell:** Build the full-screen video stage, PIP camera component, and glassmorphic HUD controls.
3. **The Token & Economy Handler:** Implement the API endpoints for Meet-to-Earn tracking, Boost activation, and gifting.
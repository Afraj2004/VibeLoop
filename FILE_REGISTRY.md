# VibeLoop — File Registry & Architectural Status

This document tracks all files across the monorepo, their purpose, interaction pathways, and build status.

| File Path | Purpose & Role | Usage & Interacting Modules | Status |
| :--- | :--- | :--- | :--- |
| `FILE_REGISTRY.md` | Single source of file manifest & current implementation states | Entire system | **Finished** |
| `HANDOVER.md` | Living record of working components, outstanding bugs, and active tasks | Development team & AI context | **Finished** |
| `DECISIONS.md` | ADR log documenting architectural trade-offs & technical choices | System design reference | **Finished** |
| `FLOW.md` | Sequential execution traces across frontend, socket engine, and Redis | Real-time debugging | **Finished** |
| `CONSTRAINTS.md` | Architectural invariants, off-limit boundaries, and design guardrails | System safety & spec compliance | **Finished** |
| `vibeloop-context.md` | Master project specification context | AI prompt grounding | **Finished** |
| `package.json` | Monorepo orchestration scripts | Root workspaces | **Finished** |
| `server/package.json` | Node.js backend dependencies | `server/` | **Finished** |
| `server/src/server.js` | HTTP & Socket.IO server; manages room signaling, SDP & ICE candidates | Called by `npm start`; interacts with `matchmaker.js`, `auth.js` | **In Progress** |
| `server/src/matchmaker.js` | Atomic Lua-driven queue matching by gender, country, and boost status | Imported by `server.js`; interacts with Redis | **In Progress** |
| `server/src/config/redis.js` | Redis client setup & connection failover handling | Imported by `matchmaker.js`, `server.js` | **In Progress** |
| `server/src/controllers/walletController.js` | Handles Meet-to-Earn tracking, daily caps (10 VIBE/day), and live gifting | Routes in `api.js` | **Finished** |
| `server/src/controllers/userController.js` | Profile adjustments, leaderboards, and user settings | Routes in `api.js` | **Planned** |
| `server/src/middlewares/auth.js` | Authenticates JWT tokens for WebSocket handshake and REST API | Express routes and Socket middleware | **Planned** |
| `server/src/routes/api.js` | REST endpoint routing for wallet, history, and gifts | Express app in `server.js` | **In Progress** |
| `server/src/routes/health.js` | Node process & Redis connection health check endpoints | Express app in `server.js` | **Planned** |
| `client/package.json` | Frontend dependencies (React, Vite, Lucide, socket.io-client) | `client/` | **Finished** |
| `client/vite.config.js` | Bundler configuration & Tailwind directives | Vite runner | **Finished** |
| `client/src/main.jsx` | React root mounting | Index HTML | **Finished** |
| `client/src/App.jsx` | Primary video stage layout and state orchestrator | Mounts HUD, Stage, and Overlay components | **In Progress** |
| `client/src/index.css` | Cyber-Luxe Tailwind styling and custom glassmorphism variables | Imported by `main.jsx` | **Finished** |
| `client/src/hooks/useVibeWebRTC.js` | WebRTC RTCPeerConnection negotiation, media constraints, & ICE handling | Imported by `App.jsx` | **In Progress** |
| `client/src/hooks/useSocket.js` | Socket.IO listener connection and event wrapper | Imported by `App.jsx`, `useVibeWebRTC.js` | **In Progress** |
| `client/src/components/stage/RemoteVideo.jsx` | Full-bleed video display component with canvas fallback | Rendered in `App.jsx` | **In Progress** |
| `client/src/components/stage/LocalPip.jsx` | Draggable PIP camera box with toggle controls | Rendered in `App.jsx` | **In Progress** |
| `client/src/components/stage/StatusBanner.jsx` | Connection state notification banner ("Searching...", "Connected") | Rendered in `App.jsx` | **In Progress** |
| `client/src/components/hud/HeaderBar.jsx` | Top HUD showing logo, online stats, M2E progress, and VIBE wallet | Rendered in `App.jsx` | **Finished** |
| `client/src/components/hud/ControlBar.jsx` | Bottom action bar with Next, Skip, Filter toggles, Chat & Gift triggers | Rendered in `App.jsx` | **In Progress** |
| `client/src/components/overlays/ChatDrawer.jsx` | Ephemeral message drawer with 30-message retention cap | Overlay in `App.jsx` | **Planned** |
| `client/src/components/overlays/GiftTray.jsx` | Micro-gifting modal (1-75 VIBE items) | Overlay in `App.jsx` | **Finished** |
| `client/src/components/overlays/BoostModal.jsx` | 1-hour VibeBoost activation & gender selection prompt | Overlay in `App.jsx` | **Planned** |
| `client/src/components/overlays/HistoryBar.jsx` | Post-match contact list bar (>20s call rule) | Overlay in `App.jsx` | **Planned** |
| `client/src/components/common/ModalBackdrop.jsx` | Reusable glassmorphic backdrop for modals | Overlay components | **Planned** |
| `client/src/utils/rtcConfig.js` | STUN/TURN server list and ICE candidate settings | Imported by `useVibeWebRTC.js` | **In Progress** |
| `client/src/utils/soundEffects.js` | Audio chimes for match connects and incoming gifts | Imported by `App.jsx` | **Planned** |
| `database/schema.sql` | PostgreSQL database schema definition | Database migrations | **Finished** |
```

```markdown HANDOVER.md
# VibeLoop — Project Handover & System State

## Current Operational State
- **Signaling & Matchmaking Backend**: Redis Lua scripts initialized for queue matching; WebSocket server handles rooms and offer/answer SDP forwarding.
- **Economy & Meet-to-Earn Layer**:
  - `walletController.js` implemented: handles Meet-to-Earn tracking (0.10 VIBE per 3 minutes active, daily cap 10 VIBE) and live gifts with 50% platform rake.
  - Express routes exposed in `server/src/routes/api.js`.
- **Frontend UI & Stage**:
  - Cyber-Luxe aesthetic configured (`#08090D` Obsidian, `#12151E` Glass, `#00F0FF` Hyper-Cyan, `#FF2A7A` Sunset Orchid).
  - `HeaderBar.jsx` displays live Meet-to-Earn countdown progress and VIBE wallet balance.
  - `GiftTray.jsx` overlay ready for sending micro-gifts with real-time balance validation.

## Pending System Modules
1. **Socket Wiring for Economy**: Emitting socket events for real-time gift animations across connected peers.
2. **Ephemeral Direct Messaging**: ChatDrawer component with client/server enforced 30-message maximum ring buffer per session.
3. **20-Second History Rule Integration**: Server-verified session duration check before pushing matches to `match_history`.
```

```markdown DECISIONS.md
# VibeLoop — Technical Decisions Record (ADR)

## ADR-001: Redis Lua Atomic Queue Matchmaking vs. Node.js In-Memory Queues
- **Decision**: Use Redis Lua atomic scripts (`EVALSHA`) for matching queues.
- **Rationale**: Prevents race conditions when two signaling server worker processes try to match the same pair of sockets simultaneously. Guarantees $O(1)$ pops.

## ADR-002: Native WebRTC PeerConnection (P2P) vs. SFU (Mediasoup/Janus)
- **Decision**: Use 1-on-1 WebRTC P2P for initial production deployment.
- **Rationale**: Minimizes server bandwidth costs for 1-on-1 roulette video streaming. ICE fallback handling via TURN servers is used for NAT traversal.

## ADR-003: 50% Platform Rake on Micro-Gifts
- **Decision**: Recipients receive 50% of sent VIBE gift value into their spending wallet.
- **Rationale**: Prevents infinite circular gift-churning inflation between colluding users farming M2E tokens.

## ADR-004: Ephemeral Messaging Capped at 30 Messages
- **Decision**: Messages are held in a circular buffer capped at 30 messages per match, purged upon room leave.
- **Rationale**: Minimizes DB persistence requirements, ensures low memory utilization, and prioritizes user privacy.
```

```markdown FLOW.md
# VibeLoop — System Execution Traces

## Trace 1: Match Queue to Peer WebRTC Connection
```text
[Client] Tap "NEXT" -> Emit `find_match` { gender, country }
  └─► [Socket Server] Receives `find_match`
        └─► [Redis Lua] `matchmaker.js` atomically pops matching candidate socket ID
              ├─► Match Found: Socket emits `match_found` to both Socket A and Socket B
              │     ├─► [Client A] `useVibeWebRTC` creates SDP Offer -> Emits `rtc_offer`
              │     ├─► [Socket Server] Forwards `rtc_offer` to Client B
              │     ├─► [Client B] Receives Offer, creates SDP Answer -> Emits `rtc_answer`
              │     ├─► [Socket Server] Forwards `rtc_answer` to Client A
              │     └─► ICE Candidate Exchange via Socket -> WebRTC PeerConnection `Connected`
              └─► Match Not Found: Socket ID queued in Redis ZSET with priority timestamp
```

## Trace 2: Meet-to-Earn Heartbeat Flow
```text
[Client App.jsx] Active WebRTC Video Stream -> Every 30 seconds:
  └─► POST /api/wallet/m2e-heartbeat { userId, activeSeconds: 30 }
        └─► [WalletController] Check today's total seconds & daily total earned
              ├─► Earned < 10.0 VIBE & 3-Min Boundary Crossed:
              │     └─► Add 0.10 VIBE to balance and daily total
              │     └─► Return { success: true, rewardEarned: 0.10, balance, secondsUntilNextReward }
              └─► Earned >= 10.0 VIBE Cap:
                    └─► Return { success: true, rewardEarned: 0.00, balance, secondsUntilNextReward: 0 }
```

## Trace 3: Live Gifting Transaction & Animation
```text
[Client A] Opens GiftTray -> Clicks "Send Cyber Rose" (1 VIBE)
  └─► POST /api/wallet/send-gift { senderId, recipientId, giftId: 'rose' }
        └─► [WalletController] Validates sender balance >= 1 VIBE
              ├─► Success:
              │     ├─► Deduct 1.0 VIBE from Sender
              │     ├─► Credit 0.50 VIBE (50%) to Recipient
              │     └─► Emit WebSocket event `receive_gift` to Recipient Socket
              │           └─► [Client B] Trigger overlay animation & audio chime
              └─► Failure: Insufficient funds error returned
```
---

# VIBELOOP MASTER SPECIFICATION & PRODUCT REQUIREMENT DOCUMENT (PRD)

```text
Document Version: 2.4.0 (Production Release Roadmap)
Product Name:     VibeLoop
System Tagline:   Stream, Vibe, Connect.
Architecture:     Event-Driven WebRTC Peer-to-Peer / SFU Hybrid
Primary Stack:    Node.js (v20+), Socket.IO, Redis (Lua Engine), React 19 (Vite), Tailwind CSS
Target Platforms: Web (Responsive Mobile/Desktop First) -> PWA -> Capacitor Native Wrapper

```

---

## 1. Executive Summary & Brand Identity

### 1.1 Product Mission

VibeLoop is a gamified, real-time video discovery platform engineered to replace legacy anonymous video roulette platforms (e.g., Camloo, Omegle, Hinge). It transforms ephemeral video matching into a high-retention ecosystem through **tokenized engagement ("Meet-to-Earn")**, **dynamic matchmaking filters**, **3D micro-gifting**, **live reputation metrics**, and a **privacy-first social layer**.

### 1.2 Design System: "Cyber-Luxe" (Dark Stage First)

* **Obsidian Core (`#08090D`):** Primary canvas background; preserves battery on mobile OLED and provides high-contrast video framing.
* **Frosted Slate Glass (`#12151E` at 75% opacity + `backdrop-blur(16px)`):** Container for cards, drawers, overlays, and floating HUD elements.


* **Hyper-Cyan Glow (`#00F0FF`):** Primary action buttons ("Start", "Next"), call status rings, active connection pings.


* **Sunset Orchid (`#FF2A7A` $\rightarrow$ `#FF7A00`):** Match boost flames, gift animations, likes, hearts, and hot streaks.


* **Champagne Gold (`#FFD166`):** VIP status badges, monthly leaderboard top ranks, verification checkmarks.


* **Border Radii & Strokes:** Outer cards `rounded-3xl`, buttons `rounded-full`, 1px translucent borders `rgba(255, 255, 255, 0.08)`.

---

## 2. Complete End-to-End User Journeys

### 2.1 Registration & Guest Onboarding

```
[User Lands] ──> [Guest Device Fingerprint Created] ──> [Browser Media Check (Cam/Mic)]
       │
       ├─ If Approved: Grant 5 Guest VIBE, issue Ephemeral Session JWT
       └─ If Denied: Fall back to Read-Only / Audio-Only Stage with warning

```

* **Instant Guest Access:** No friction login. Upon landing, users receive an anonymous UUID session stored in `localStorage` and signed by the backend via JWT.
* **Auth Escalation (Social/Email Auth):** Users can upgrade to a permanent account (Google, Apple, Telegram, or Email Magic Link) to retain accumulated VIBE tokens, unlock the public Leaderboard, and access offline Direct Messages.


* **Device Permission Guard:** Enforces `navigator.mediaDevices.getUserMedia({ video: true, audio: true })` check before enqueueing. If permissions are rejected, display inline animated setup instructions.

### 2.2 Discovery & Matchmaking Loop

```
[Select Filters (Country/Gender)] ──> [Emit 'find_partner'] ──> [Redis Lua Atomic Queue]
                                                                        │
       ┌─────────────────────────────── Match Found ────────────────────┘
       ▼
[Assign Room UUID] ──> [Designate Initiator vs Receiver] ──> [SDP Offer/Answer Exchange]
       │
       ▼
[STUN/TURN ICE Handshake] ──> [P2P Media Flow Established] ──> [Start Active Call Timers]

```

1. **Queue Parameter Matching:** The user selects target criteria (Country code or "ALL", target gender: `any`, `female`, or `male`).


2. **Atomic Queueing:** Socket.IO pushes the request into a Redis Set. An atomic Lua script pulls an eligible peer from the reciprocal set without race conditions.
3. **Session Negotiation:**
* User A (Initiator) receives `match_found { isInitiator: true, peerId }`.
* User B (Receiver) receives `match_found { isInitiator: false, peerId }`.
* WebRTC `RTCPeerConnection` initializes with STUN/TURN configurations. Local tracks are attached and negotiated over WebSockets.


4. **"Next" / Skip Action:** Either peer can click "Next" at any point. The signaling server closes the call, tears down WebRTC resources on both clients, fires `partner_left`, and immediately pushes the skipping user back into the matching pool.



### 2.3 The 20-Second Contact Retention Engine

* **The Rule:** Any interaction lasting $\ge 20$ seconds automatically logs the peer into the user's `Connection History` carousel.


* **History Tray Limit:** Displays up to the last 10 historical contacts.


* **Data Logged:** Matched User UUID, display name, avatar snapshot/blur, country flag, duration of call, and last seen timestamp.


* **Actionable Contacts:** Users can tap a history card to:
* Send a Friend Request.


* Send an offline Gift.


* Open the 30-message ephemeral chat drawer.





### 2.4 In-Call Interactions & Ephemeral Chat

* **Live In-Call Text Chat:** Real-time messages overlaid directly on the video feed.
* **Strict Privacy Limit:** Direct messaging stores a **maximum of 30 messages** per conversation pair. Older messages are deleted automatically (`LTRIM` in Redis / FIFO database cleanup).


* **Live Hearts / Reactions:** Floating tap-to-react emojis (Hearts, Fire, Thumbs Up) rendered using HTML5 Canvas or CSS transforms directly over the stream.

### 2.5 Micro-Gifting & Economy Engine

* **Virtual Currency (VIBE Tokens):**
* **Meet-to-Earn Mechanics:** Free users earn +0.10 VIBE for every 3 minutes of continuous active video connection. Capped strictly at **10 VIBE/day** to prevent bot farming.


* **Refill / Purchase:** Native fiat integration (Stripe, Razorpay, Apple/Google IAP, Crypto via Coinbase/NowPayments) to top up VIBE bundles.


* **Gift Matrix:**
* Compliment: 1 VIBE


* Lucky Clover: 5 VIBE


* Neon Rose: 10 VIBE


* Translucent Diamond: 20 VIBE


* Chrome Ring: 40 VIBE


* Royal Crown: 75 VIBE




* **Economic Split:** Platform retains 50% as rake revenue; recipient receives 50% credited to their cash-out/claimable wallet balance.
* **Match Boost:** Users spend 10 VIBE to activate a 1-hour **VibeBoost**:


* Displays user profile with verification ring and flame badge.


* Grants top matchmaking priority in preferred gender queues.


* Reveals incoming peer gender tags before the connection fully establishes.





---

## 3. Database Schema & Architecture (PostgreSQL + Redis)

### 3.1 Relational Schema (`database/schema.sql`)

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE,
    username VARCHAR(32) NOT NULL DEFAULT 'Stranger',
    avatar_url TEXT,
    gender VARCHAR(10) NOT NULL DEFAULT 'other' CHECK (gender IN ('male', 'female', 'other')),
    country_code VARCHAR(3) NOT NULL DEFAULT 'ALL',
    vibe_balance NUMERIC(12, 2) NOT NULL DEFAULT 5.00,
    earned_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Cashable wallet balance
    daily_earned_tokens NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    last_earned_date DATE DEFAULT CURRENT_DATE,
    rank_points BIGINT NOT NULL DEFAULT 0,
    is_vip BOOLEAN NOT NULL DEFAULT FALSE,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    hide_country BOOLEAN NOT NULL DEFAULT FALSE,
    hide_history BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Connection History (20-second threshold records)
CREATE TABLE match_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    peer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_peer_match UNIQUE (user_id, peer_id, created_at)
);

-- Friendships & Social Graph
CREATE TABLE friends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_friendship UNIQUE (requester_id, addressee_id)
);

-- Ephemeral Direct Messages (Application limits retention to 30)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body VARCHAR(500) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_messages_chat_pair ON messages(sender_id, recipient_id, created_at DESC);

-- Ledger / Transactions
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    transaction_type VARCHAR(32) NOT NULL, -- 'EARN_CHAT', 'PURCHASE_BOOST', 'SEND_GIFT', 'RECEIVE_GIFT', 'WALLET_REFILL'
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

```

### 3.2 Redis In-Memory State Mapping

* `queue:{COUNTRY}:{GENDER}`: Redis Set holding waiting socket IDs.
* `user:{SOCKET_ID}`: Hash containing `userId`, `targetGender`, `targetCountry`, `inCallWith`, `connectedAt`, and `hasBoost`.
* `history:{USER_ID}`: Capped Redis List (`LTRIM 0 9`) storing the last 10 contacts.


* `chat:{USER_ID_A}:{USER_ID_B}`: Capped Redis List (`LTRIM 0 29`) holding the 30 ephemeral messages.


* `ratelimit:{IP}`: String with expiration for API and WebSocket event throttling.

---

## 4. Complete Application File Structure

```text
VibeLoop/
├── VIBELOOP_MASTER_SPEC.md          # Complete project specification and architecture
├── FILE_REGISTRY.md                 # Complete index of all files, their purpose, and lifecycle
├── HANDOVER.md                      # Living execution state across development sessions
├── DECISIONS.md                     # Architectural choices and trade-off rationale
├── FLOW.md                          # Data & event execution path traces
├── CONSTRAINTS.md                   # System boundaries and coding standards
├── docker-compose.yml               # Multi-container orchestration (App, Redis, Postgres, Coturn)
│
├── server/                          # Real-Time & Backend API
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── server.js                # App entry, HTTP server, and Socket.IO initialization
│   │   ├── matchmaker.js            # Redis atomic Lua queue matching logic
│   │   ├── config/
│   │   │   ├── db.js                # PostgreSQL connection pool (pg/prisma)
│   │   │   └── redis.js             # Redis client and Lua script definitions
│   │   ├── controllers/
│   │   │   ├── authController.js    # Guest session issuance and OAuth handlers
│   │   │   ├── walletController.js  # Meet-to-Earn timer processing, refill hooks
│   │   │   ├── giftController.js    # In-call gift transfers and ledger updates
│   │   │   └── userController.js    # Profile management, leaderboard queries
│   │   ├── routes/
│   │   │   ├── api.js               # REST route registration
│   │   │   └── webhooks.js          # Payment provider callbacks (Stripe, Razorpay)
│   │   ├── middlewares/
│   │   │   ├── auth.js              # JWT session verification
│   │   │   └── rateLimiter.js       # Redis-backed abuse prevention
│   │   └── services/
│   │       ├── webrtcSignaling.js   # SDP offer/answer/ICE routing handlers
│   │       └── moderation.js        # Automated frame sampling/nudity scanner
│
└── client/                          # React 19 Frontend (Vite)
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js
    ├── src/
    │   ├── main.jsx                 # Client entry point
    │   ├── App.jsx                  # Main video stage and layout orchestrator
    │   ├── index.css                # Tailwind imports and Cyber-Luxe tokens
    │   ├── hooks/
    │   │   ├── useVibeWebRTC.js     # RTCPeerConnection negotiation, streams, and tracks
    │   │   ├── useSocket.js         # Socket connection lifecycle
    │   │   └── useEarnTimer.js      # Meet-to-Earn client timer and credit claims
    │   ├── components/
    │   │   ├── stage/
    │   │   │   ├── RemoteVideo.jsx  # Full-screen edge-to-edge remote video element
    │   │   │   ├── LocalPip.jsx     # Draggable Picture-in-Picture stream
    │   │   │   └── CallOverlay.jsx  # Connection states ("Searching...", "Connected")
    │   │   ├── hud/
    │   │   │   ├── HeaderBar.jsx    # Logo, online count, VIBE balance, boost pill
    │   │   │   └── ControlBar.jsx   # Next button, gift button, chat toggle, filters
    │   │   ├── overlays/
    │   │   │   ├── GiftTray.jsx     # 3D interactive gift drawer
    │   │   │   ├── BoostModal.jsx   # Match boost purchase dialog
    │   │   │   ├── FilterModal.jsx  # Gender & country preference selection
    │   │   │   ├── ChatDrawer.jsx   # 30-message ephemeral messenger
    │   │   │   └── HistoryBar.jsx   # 20-second threshold recent contact strip
    │   │   └── common/
    │   │       ├── GlassModal.jsx   # Translucent modal base component
    │   │       └── Toast.jsx        # Gift notifications and system alerts
    │   └── utils/
    │       ├── rtcConfig.js         # STUN/TURN server arrays and ICE candidates
    │       └── api.js               # Axios / Fetch client wrapper

```

---

## 5. Phased Implementation Roadmap

### Phase 1: Local Real-Time Core (Completed / Current State)

* [x] Brand identity, Cyber-Luxe dark theme, visual tokens.
* [x] Redis atomic queue Lua script matchmaking by country & gender.
* [x] WebSockets signaling engine with SDP offer/answer and ICE candidate forwarding.
* [x] React single-viewport video canvas with PiP camera.
* [x] In-call ephemeral chat and 20-second history logic.



### Phase 2: Tokenomics, Economy & Social Layer

* [ ] **Meet-to-Earn Backend Engine:** Redis heartbeat timer verifying active streams; increments wallet by 0.10 VIBE per 3 minutes up to the 10 VIBE daily cap.


* [ ] **3D Micro-Gifting Engine:** Socket events (`send_gift`) that animate CSS/canvas gifts across screens and execute atomic balance transfers in PostgreSQL.
* [ ] **Social Retention Engine:** Implement PostgreSQL `match_history` writing on call teardown if duration $\ge 20$ seconds.


* [ ] **Friend System:** Mutual friend requests sent from the recent history bar.



### Phase 3: Media Hardening, TURN & Trust/Safety

* [ ] **Coturn Server Infrastructure:** Configure co-located or cloud TURN servers to handle corporate firewalls and symmetric NATs.
* [ ] **AI Vision Moderation:** Client-side WebGL/TensorFlow.js or background Node microservice running nudity and black-screen detection on video canvases. Flags trigger instant auto-skips and temporary queue bans.
* [ ] **Abuse & Rate-Limiting:** IP-based skip-spam throttles preventing bot networks from cycling queues.

### Phase 4: Production Deployment & Scale

* [ ] **Containerization:** Write multi-stage Dockerfiles for Client (Nginx alpine) and Server (Node slim).
* [ ] **Cluster Infrastructure:** Deploy on cloud VMs (AWS, Hetzner, or DigitalOcean) fronted by Cloudflare CDN for static assets and WebSocket reverse proxying via Caddy/Nginx with TLS 1.3.
* [ ] **Database Orchestration:** Managed Postgres with read replicas and automated backups; Redis Sentinel or Redis Cloud cluster.

---

## 6. Detailed Production Deployment Guide

### 6.1 Docker Orchestration (`docker-compose.yml`)

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: always

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: vibeloop
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
    restart: always

  coturn:
    image: coturn/coturn:latest
    restart: always
    network_mode: "host"
    volumes:
      - ./coturn/turnserver.conf:/etc/turnserver.conf:ro

  server:
    build:
      context: ./server
      dockerfile: Dockerfile
    environment:
      PORT: 4000
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/vibeloop
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      - redis
      - postgres
    restart: always

  client:
    build:
      context: ./client
      dockerfile: Dockerfile
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - server
    restart: always

volumes:
  redis_data:
  pg_data:

```

### 6.2 TURN Server Configuration (`turnserver.conf`)

WebRTC requires a TURN server to bridge connections across strict symmetric NATs and mobile carrier cellular connections:

```ini
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
external-ip=YOUR_SERVER_PUBLIC_IP
realm=turn.vibeloop.com
lt-cred-mech
user=vibeloopuser:SecureTurnPassword123
stale-nonce=600
fingerprint
no-cli
no-tcp-relay

```

### 6.3 Reverse Proxy & SSL (Caddyfile)

```caddy
vibeloop.com {
    encode zstd gzip

    # Frontend Static Distribution
    handle /assets/* {
        root * /var/www/client/dist
        file_server
    }

    # Real-Time WebSocket Signaling
    handle /socket.io/* {
        reverse_proxy server:4000 {
            header_up Host {host}
            header_up X-Real-IP {remote}
        }
    }

    # REST API endpoints
    handle /api/* {
        reverse_proxy server:4000
    }

    handle {
        root * /var/www/client/dist
        try_files {path} /index.html
        file_server
    }
}

```

---

## 7. Future Expansion & Long-Term Roadmap

1. **Selective Forwarding Unit (SFU) Transition:**
* Migrate 1-on-1 P2P calls to an SFU architecture (e.g., LiveKit or Mediasoup) to enable party rooms, multi-guest streaming, and server-side compositing.


2. **AI Real-Time Translation:**
* In-stream speech-to-text with auto-translated subtitle overlays, breaking language barriers during international matches.




3. **AR Facial Filters & Avatar Masks:**
* WebGL / DeepAR face mesh filters (glasses, neon masks, skin retouching) allowing camera-shy users to participate comfortably.


4. **Creator Monetization & Cash-Outs:**
* Convert earned gift tokens to real-world payouts via Stripe Connect or cryptocurrency rails, turning VibeLoop into a full creator economy live-discovery app.


5. **Mobile Native Apps (React Native / Flutter):**
* Package native WebRTC applications with push notifications for offline direct messages, incoming friend calls, and leaderboard rank alerts.





---
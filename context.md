# VibeLoop — Project Architecture & File Manifest

## Root Directory: VibeLoop/

```text
VibeLoop/
├── vibeloop-context.md              # Project specification, rules, and AI context
├── .env.example                     # Environment variables template
├── package.json                     # Monorepo/Root workspace orchestration
│
├── server/                          # Signaling & Real-Time Engine (Node.js/Socket.IO)
│   ├── package.json                 # Backend dependencies (express, socket.io, ioredis, uuid)
│   ├── .env                         # Server environment configs (PORT, REDIS_URL, JWT_SECRET)
│   ├── src/
│   │   ├── server.js                # Main HTTP & Socket.IO server entry point
│   │   ├── matchmaker.js            # Redis atomic Lua queue matching logic
│   │   ├── config/
│   │   │   └── redis.js             # Redis client initialization & connection handlers
│   │   ├── controllers/
│   │   │   ├── walletController.js  # Meet-to-Earn tracking, refill & gift endpoints
│   │   │   └── userController.js    # Profile settings, privacy toggles, leaderboard
│   │   ├── middlewares/
│   │   │   └── auth.js              # Token validation and session verification
│   │   └── routes/
│   │       ├── api.js               # REST endpoints for tokens, history, and gifts
│   │       └── health.js            # Node/Redis health checks
│
├── client/                          # Front-End Web Application (React + Vite)
│   ├── package.json                 # Frontend dependencies (react, lucide-react, socket.io-client)
│   ├── vite.config.js               # Vite bundler & Tailwind configuration
│   ├── index.html                   # HTML entry point (meta tags, viewport setup)
│   ├── public/
│   │   ├── favicon.ico              # VibeLoop infinity loop icon
│   │   └── assets/                  # Static SVGs, 3D gift icons (rose, diamond, crown)
│   └── src/
│       ├── main.jsx                 # React root mounting
│       ├── App.jsx                  # Primary video chat stage and layout orchestrator
│       ├── index.css                # Tailwind directives and CSS theme variables
│       ├── hooks/
│       │   ├── useVibeWebRTC.js     # Native WebRTC peer negotiation & camera hook
│       │   └── useSocket.js         # Socket.IO connection and event listener wrapper
│       ├── components/
│       │   ├── stage/
│       │   │   ├── RemoteVideo.jsx  # Full-screen edge-to-edge video canvas
│       │   │   ├── LocalPip.jsx     # Draggable picture-in-picture local camera
│       │   │   └── StatusBanner.jsx # Connection indicator ("Searching...", "Connected")
│       │   ├── hud/
│       │   │   ├── HeaderBar.jsx    # Logo, online counter, VIBE wallet pill, boost button
│       │   │   └── ControlBar.jsx   # Next button, filter toggles, gift/chat triggers
│       │   ├── overlays/
│       │   │   ├── ChatDrawer.jsx   # Floating ephemeral chat box (30-message retention)
│       │   │   ├── GiftTray.jsx     # Micro-gifting modal (1 to 75 VIBE items)
│       │   │   ├── BoostModal.jsx   # 1-hour VibeBoost activation & gender selection dialog
│       │   │   └── HistoryBar.jsx   # Recent contacts strip (saved after >20s match)
│       │   └── common/
│       │       └── ModalBackdrop.jsx# Frosted glassmorphic modal wrapper
│       └── utils/
│           ├── rtcConfig.js         # STUN/TURN server URLs and ICE configuration
│           └── soundEffects.js      # Audio chimes for new connections and gifts
│
└── database/                        # Persistence & Migrations
    └── schema.sql                   # PostgreSQL schema (users, match_history, tokens, messages)
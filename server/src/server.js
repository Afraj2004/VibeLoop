require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const apiRoutes = require('./routes/api');
const { getHealth } = require('./controllers/healthController');
const { registerSignaling } = require('./services/webrtcSignaling');

const app = express();
const server = http.createServer(app);

// Behind a reverse proxy (Render, Caddy, Nginx) set TRUST_PROXY to the hop count so
// req.ip is the real client address used by IP rate limits. Leave unset when exposed directly,
// otherwise clients could spoof X-Forwarded-For to dodge limits.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY));
}

// Comma-separated list of allowed client origins; open in local development
const allowedOrigins = process.env.CLIENT_ORIGINS
  ? process.env.CLIENT_ORIGINS.split(',').map((o) => o.trim())
  : '*';

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE']
}));

app.use(express.json({ limit: '16kb' }));

// Root status endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'VibeLoop Signaling & Economy Engine',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      iceServers: '/api/ice-servers',
      walletBalance: '/api/wallet/balance'
    },
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api', apiRoutes);

// Health check endpoint: 200 only when Postgres and Redis both respond ("/" stays a plain liveness ping)
app.get('/health', getHealth);

// Socket.IO Signaling Server Setup
const io = new Server(server, {
  // SDP offers are a few KB; nothing legitimate needs the 1 MB default
  maxHttpBufferSize: 64 * 1024,
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

const signaling = registerSignaling(io);

// Lets REST controllers push real-time events (e.g. gift notifications)
app.set('io', io);
app.set('signaling', signaling);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🚀 VibeLoop Server running on port ${PORT}`);
  console.log(`📡 ICE/TURN API: http://localhost:${PORT}/api/ice-servers`);
  console.log(`=================================`);
});

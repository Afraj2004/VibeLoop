require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const apiRoutes = require('./routes/api');
const { registerSignaling } = require('./services/webrtcSignaling');

const app = express();
const server = http.createServer(app);

// Comma-separated list of allowed client origins; open in local development
const allowedOrigins = process.env.CLIENT_ORIGINS
  ? process.env.CLIENT_ORIGINS.split(',').map((o) => o.trim())
  : '*';

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST']
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO Signaling Server Setup
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

registerSignaling(io);

// Lets REST controllers push real-time events (e.g. gift notifications)
app.set('io', io);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🚀 VibeLoop Server running on port ${PORT}`);
  console.log(`📡 ICE/TURN API: http://localhost:${PORT}/api/ice-servers`);
  console.log(`=================================`);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const apiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);

// Enable CORS for client communication
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));

app.use(express.json());

// API Routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO Signaling Server Setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log(`[VibeLoop Socket] User connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[VibeLoop Socket] User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🚀 VibeLoop Server running on port ${PORT}`);
  console.log(`📡 ICE/TURN API: http://localhost:${PORT}/api/ice-servers`);
  console.log(`=================================`);
});
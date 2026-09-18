const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const turnController = require('../controllers/turnController');

// ICE / STUN / TURN Credentials
router.get('/ice-servers', turnController.getIceServers);

// Economy & Meet-to-Earn routes
router.get('/wallet/balance', walletController.getBalance);
router.post('/wallet/m2e-heartbeat', walletController.processMeetToEarn);
router.get('/wallet/gifts', walletController.getGifts);
router.post('/wallet/send-gift', walletController.sendGift);

module.exports = router;
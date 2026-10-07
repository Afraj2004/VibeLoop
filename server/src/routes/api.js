const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const turnController = require('../controllers/turnController');
const authController = require('../controllers/authController');
const auth = require('../middlewares/auth');

// Authentication
router.post('/auth/guest', authController.createGuest);
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/me', auth, authController.getMe);

// ICE / STUN / TURN Credentials (authenticated so relay credentials are not handed to anyone)
router.get('/ice-servers', auth, turnController.getIceServers);

// Economy routes (Meet-to-Earn accrues over the signaling socket from server-measured call time)
router.get('/wallet/balance', auth, walletController.getBalance);
router.get('/wallet/gifts', walletController.getGifts);
router.post('/wallet/send-gift', auth, walletController.sendGift);

module.exports = router;

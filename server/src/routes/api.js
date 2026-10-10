const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const turnController = require('../controllers/turnController');
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const accountController = require('../controllers/accountController');
const adminController = require('../controllers/adminController');
const requireAdmin = require('../middlewares/requireAdmin');
const auth = require('../middlewares/auth');
const { rateLimit } = require('../middlewares/rateLimiter');

const HOUR = 60 * 60;

// Authentication
router.post('/auth/guest', rateLimit({ name: 'guest', limit: 20, windowSeconds: HOUR }), authController.createGuest);
router.post('/auth/register', rateLimit({ name: 'register', limit: 5, windowSeconds: HOUR }), authController.register);
router.post('/auth/login', rateLimit({ name: 'login', limit: 10, windowSeconds: 15 * 60 }), authController.login);
router.get('/auth/me', auth, authController.getMe);
router.patch(
  '/auth/profile',
  auth,
  rateLimit({ name: 'profile', limit: 20, windowSeconds: HOUR, by: 'user' }),
  authController.updateProfile
);

// 20-second contact history
router.get('/history', auth, userController.getHistory);

// Personal data rights: export and erasure
router.get(
  '/account/export',
  auth,
  rateLimit({ name: 'export', limit: 5, windowSeconds: HOUR, by: 'user' }),
  accountController.exportData
);
router.delete(
  '/account',
  auth,
  rateLimit({ name: 'delete-account', limit: 5, windowSeconds: HOUR, by: 'user' }),
  accountController.deleteAccount
);

// Moderation (admins only)
router.get('/admin/reports', auth, requireAdmin, adminController.listReportedUsers);
router.post('/admin/users/:id/ban', auth, requireAdmin, adminController.banUser);
router.post('/admin/users/:id/unban', auth, requireAdmin, adminController.unbanUser);
router.post('/admin/users/:id/dismiss', auth, requireAdmin, adminController.dismissReports);

// ICE / STUN / TURN Credentials (authenticated so relay credentials are not handed to anyone)
router.get(
  '/ice-servers',
  auth,
  rateLimit({ name: 'ice', limit: 60, windowSeconds: HOUR, by: 'user' }),
  turnController.getIceServers
);

// Economy routes (Meet-to-Earn accrues over the signaling socket from server-measured call time)
router.get('/wallet/balance', auth, walletController.getBalance);
router.get('/wallet/gifts', walletController.getGifts);
router.post(
  '/wallet/send-gift',
  auth,
  rateLimit({ name: 'gift', limit: 30, windowSeconds: 60, by: 'user' }),
  walletController.sendGift
);

module.exports = router;

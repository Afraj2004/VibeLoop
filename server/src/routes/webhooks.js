const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/paymentsController');

// Signature checks need the exact raw bytes, so these routes bypass the JSON parser
router.post('/razorpay', express.raw({ type: 'application/json', limit: '256kb' }), paymentsController.handleWebhook);

module.exports = router;

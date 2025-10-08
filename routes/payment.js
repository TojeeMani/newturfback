const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createPaymentOrder,
  verifyPayment,
  getPaymentStatus,
  handlePaymentWebhook
} = require('../controllers/paymentController');

// @route   POST /api/payment/create-order
// @desc    Create Razorpay payment order
// @access  Private
router.post('/create-order', protect, createPaymentOrder);

// @route   POST /api/payment/verify
// @desc    Verify Razorpay payment
// @access  Private
router.post('/verify', protect, verifyPayment);

// @route   GET /api/payment/status/:orderId
// @desc    Get payment status
// @access  Private
router.get('/status/:orderId', protect, getPaymentStatus);

// @route   POST /api/payment/webhook
// @desc    Handle Razorpay webhooks
// @access  Public (but verified)
router.post('/webhook', handlePaymentWebhook);

module.exports = router;
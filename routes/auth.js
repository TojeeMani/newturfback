const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  forgotPassword,
  resetPassword,
  resendVerification,
  firebaseAuth,
  verifyOTP,
  resendOTP,
  checkEmailExists,
  sendLoginOTP,
  loginWithOTP
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limiting for OTP requests (more restrictive)
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 OTP requests per windowMs
  message: 'Too many OTP requests from this IP, please try again later.',
  skipSuccessfulRequests: true
});

// Validation error handling middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      type: 'VALIDATION_ERROR',
      errors: errors.array()
    });
  }
  next();
};

const router = express.Router();

// Validation middleware
const registerValidation = [
  body('firstName').trim().isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),
  body('lastName').trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('phone')
    .matches(/^[0-9+\-\s()]+$/)
    .withMessage('Please provide a valid phone number')
    .custom(async (value) => {
      const existingUser = await User.findOne({ phone: value });
      if (existingUser) {
        throw new Error('Phone number already in use');
      }
      return true;
    }),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('userType').isIn(['player', 'owner']).withMessage('User type must be either player or owner'),
  body('agreeToTerms').equals('true').withMessage('You must agree to terms and conditions'),
  // Conditional validation based on user type
  body().custom((value, { req }) => {
    if (req.body.userType === 'player') {
      if (!value.preferredSports || value.preferredSports.length === 0) {
        throw new Error('Preferred sports are required for players');
      }
      if (!value.skillLevel) {
        throw new Error('Skill level is required for players');
      }
      if (!value.location) {
        throw new Error('Location is required for players');
      }
    }

    if (req.body.userType === 'owner') {
      if (!value.businessName) {
        throw new Error('Business name is required for turf owners');
      }
      if (!value.businessAddress) {
        throw new Error('Business address is required for turf owners');
      }
      if (!value.businessPhone) {
        throw new Error('Business phone is required for turf owners');
      }
      if (!value.turfCount) {
        throw new Error('Number of turfs is required for turf owners');
      }
    }

    return true;
  })
];

const loginValidation = [
  body('password').notEmpty().withMessage('Password is required'),
  // Custom validation for email OR username
  body().custom((value, { req }) => {
    const { email, username } = req.body;

    if (!email && !username) {
      throw new Error('Please provide either email or username');
    }

    if (email && username) {
      throw new Error('Please provide either email or username, not both');
    }

    if (email && !email.includes('@')) {
      throw new Error('Please provide a valid email address');
    }

    return true;
  })
];

const firebaseAuthValidation = [
  body('firebaseToken').notEmpty().withMessage('Firebase token is required')
];

const forgotPasswordValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email')
];

const resetPasswordValidation = [
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
];

// Test route to verify server is running our updated code
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Updated auth routes are working',
    timestamp: new Date().toISOString()
  });
});

// Routes
router.post('/register', registerValidation, handleValidationErrors, register);
router.post('/login', loginValidation, handleValidationErrors, login);
router.post('/firebase', firebaseAuthValidation, handleValidationErrors, firebaseAuth);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.post('/logout', protect, logout);
router.post('/forgotpassword', forgotPasswordValidation, handleValidationErrors, forgotPassword);
router.put('/resetpassword/:resettoken', resetPasswordValidation, handleValidationErrors, resetPassword);
router.post('/resend-verification', forgotPasswordValidation, handleValidationErrors, resendVerification);

// OTP Login routes
router.post('/send-login-otp', otpLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email')
], handleValidationErrors, sendLoginOTP);

router.post('/login-otp', otpLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('otp').isLength({ min: 4, max: 4 }).withMessage('OTP must be 4 digits')
], handleValidationErrors, loginWithOTP);

// OTP verification routes
router.post('/verify-otp', otpLimiter, [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
], handleValidationErrors, verifyOTP);

router.post('/resend-otp', otpLimiter, [
  body('userId').notEmpty().withMessage('User ID is required')
], resendOTP);

// Email validation route
router.post('/check-email', [
  body('email').isEmail().withMessage('Please provide a valid email')
], handleValidationErrors, checkEmailExists);

module.exports = router;
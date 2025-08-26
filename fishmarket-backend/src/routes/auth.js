const express = require('express');
const router = express.Router();

// Import controllers
const AuthController = require('../controllers/auth/authController');
const KYCController = require('../controllers/auth/kycController');

// Import middleware
const authMiddleware = require('../middleware/auth');
const validationMiddleware = require('../middleware/validation');

// Import validation schemas
const { 
  otpStartSchema, 
  otpVerifySchema, 
  refreshTokenSchema, 
  updateProfileSchema 
} = require('../utils/validation/schemas/userSchema');

/**
 * @route   POST /api/v1/auth/otp/start
 * @desc    Start OTP verification process
 * @access  Public
 * @body    { phone: string }
 */
router.post('/otp/start', 
  validationMiddleware.validateBody(otpStartSchema),
  AuthController.startOtp
);

/**
 * @route   POST /api/v1/auth/otp/verify
 * @desc    Verify OTP and authenticate user
 * @access  Public
 * @body    { phone: string, otp: string }
 */
router.post('/otp/verify',
  validationMiddleware.validateBody(otpVerifySchema),
  AuthController.verifyOtp
);

/**
 * @route   POST /api/v1/auth/otp/resend
 * @desc    Resend OTP code
 * @access  Public
 * @body    { phone: string }
 */
router.post('/otp/resend',
  validationMiddleware.validateBody(otpStartSchema),
  AuthController.resendOtp
);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 * @body    { refreshToken: string }
 */
router.post('/refresh',
  validationMiddleware.validateBody(refreshTokenSchema),
  AuthController.refreshToken
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user and revoke refresh token
 * @access  Private
 */
router.post('/logout',
  authMiddleware,
  AuthController.logout
);

/**
 * @route   GET /api/v1/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile',
  authMiddleware,
  AuthController.getProfile
);

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update user profile
 * @access  Private
 * @body    { name?: string, email?: string }
 */
router.put('/profile',
  authMiddleware,
  validationMiddleware.validateBody(updateProfileSchema),
  AuthController.updateProfile
);

/**
 * @route   GET /api/v1/auth/check
 * @desc    Check authentication status
 * @access  Public (but checks for token)
 */
router.get('/check',
  AuthController.checkAuth
);

/**
 * @route   POST /api/v1/auth/change-role
 * @desc    Change user role (admin only)
 * @access  Private (Super Admin only)
 * @body    { userId: number, role: string }
 */
router.post('/change-role',
  authMiddleware,
  AuthController.changeRole
);

/**
 * @route   GET /api/v1/auth/stats
 * @desc    Get user statistics (admin only)
 * @access  Private (Super Admin only)
 */
router.get('/stats',
  authMiddleware,
  AuthController.getUserStats
);

// KYC Related Routes

/**
 * @route   POST /api/v1/auth/kyc/submit
 * @desc    Submit KYC documents
 * @access  Private
 */
router.post('/kyc/submit',
  authMiddleware,
  KYCController.submitKYC
);

/**
 * @route   GET /api/v1/auth/kyc/status
 * @desc    Get KYC status
 * @access  Private
 */
router.get('/kyc/status',
  authMiddleware,
  KYCController.getKYCStatus
);

/**
 * @route   PUT /api/v1/auth/kyc/review
 * @desc    Review KYC submission (admin only)
 * @access  Private (Super Admin only)
 */
router.put('/kyc/review',
  authMiddleware,
  KYCController.reviewKYC
);

/**
 * @route   GET /api/v1/auth/kyc/pending
 * @desc    Get pending KYC submissions (admin only)
 * @access  Private (Super Admin only)
 */
router.get('/kyc/pending',
  authMiddleware,
  KYCController.getPendingKYC
);

module.exports = router;
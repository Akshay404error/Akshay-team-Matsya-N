const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

const { query } = require('../config/database');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { authMiddleware } = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation middleware
const validateRegistration = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('firstName').trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('lastName').trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
  body('role').isIn(['fisherman', 'buyer', 'admin']).withMessage('Valid role is required'),
  body('phone').optional().isMobilePhone().withMessage('Valid phone number is required')
];

const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
];

// Generate JWT token
const generateToken = (userId, email, role) => {
  return jwt.sign(
    { userId, email, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// POST /api/auth/register
router.post('/register', authLimiter, validateRegistration, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { email, password, firstName, lastName, role, phone, address } = req.body;

  // Check if user already exists
  const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existingUser.rows.length > 0) {
    throw new AppError('User with this email already exists', 400);
  }

  // Hash password
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Generate user ID
  const userId = uuidv4();

  // Insert user
  const userResult = await query(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, role, phone, address, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    RETURNING id, email, first_name, last_name, role, phone, is_active, created_at
  `, [userId, email, hashedPassword, firstName, lastName, role, phone, address]);

  const user = userResult.rows[0];

  // Generate token
  const token = generateToken(user.id, user.email, user.role);

  logger.info(`User registered: ${email} (${role})`);

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        phone: user.phone,
        isActive: user.is_active,
        createdAt: user.created_at
      }
    }
  });
}));

// POST /api/auth/login
router.post('/login', authLimiter, validateLogin, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { email, password } = req.body;

  // Find user
  const userResult = await query(`
    SELECT id, email, password_hash, first_name, last_name, role, phone, is_active, last_login
    FROM users 
    WHERE email = $1
  `, [email]);

  if (userResult.rows.length === 0) {
    throw new AppError('Invalid email or password', 401);
  }

  const user = userResult.rows[0];

  if (!user.is_active) {
    throw new AppError('Account is deactivated', 401);
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', 401);
  }

  // Update last login
  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  // Generate token
  const token = generateToken(user.id, user.email, user.role);

  logger.info(`User logged in: ${email}`);

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        phone: user.phone,
        isActive: user.is_active,
        lastLogin: user.last_login
      }
    }
  });
}));

// GET /api/auth/profile
router.get('/profile', authMiddleware, asyncHandler(async (req, res) => {
  const userResult = await query(`
    SELECT id, email, first_name, last_name, role, phone, address, is_active, created_at, last_login
    FROM users 
    WHERE id = $1
  `, [req.user.id]);

  if (userResult.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  const user = userResult.rows[0];

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        phone: user.phone,
        address: user.address,
        isActive: user.is_active,
        createdAt: user.created_at,
        lastLogin: user.last_login
      }
    }
  });
}));

// PUT /api/auth/profile
router.put('/profile', authMiddleware, [
  body('firstName').optional().trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('lastName').optional().trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
  body('phone').optional().isMobilePhone().withMessage('Valid phone number is required'),
  body('address').optional().trim().isLength({ min: 5 }).withMessage('Address must be at least 5 characters')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { firstName, lastName, phone, address } = req.body;
  const updates = [];
  const values = [];
  let paramCount = 1;

  if (firstName) {
    updates.push(`first_name = $${paramCount}`);
    values.push(firstName);
    paramCount++;
  }

  if (lastName) {
    updates.push(`last_name = $${paramCount}`);
    values.push(lastName);
    paramCount++;
  }

  if (phone) {
    updates.push(`phone = $${paramCount}`);
    values.push(phone);
    paramCount++;
  }

  if (address) {
    updates.push(`address = $${paramCount}`);
    values.push(address);
    paramCount++;
  }

  if (updates.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No valid fields to update'
    });
  }

  updates.push(`updated_at = NOW()`);
  values.push(req.user.id);

  const userResult = await query(`
    UPDATE users 
    SET ${updates.join(', ')}
    WHERE id = $${paramCount}
    RETURNING id, email, first_name, last_name, role, phone, address, updated_at
  `, values);

  const user = userResult.rows[0];

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        phone: user.phone,
        address: user.address,
        updatedAt: user.updated_at
      }
    }
  });
}));

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { currentPassword, newPassword } = req.body;

  // Get user's current password hash
  const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (userResult.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
  if (!isCurrentPasswordValid) {
    throw new AppError('Current password is incorrect', 400);
  }

  // Hash new password
  const saltRounds = 12;
  const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

  // Update password
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', 
    [hashedNewPassword, req.user.id]);

  logger.info(`Password changed for user: ${req.user.email}`);

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
}));

module.exports = router;
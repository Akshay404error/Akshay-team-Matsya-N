const User = require('../../models/User');
const { otp } = require('../../config/redis');
const logger = require('../../utils/logger');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class AuthController {
  // Start OTP verification process
  static async startOtp(req, res, next) {
    try {
      const { phone } = req.body;

      // Validate phone number format
      if (!phone || !phone.match(/^\+[1-9]\d{1,14}$/)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid phone number format. Use international format (+1234567890)',
          code: 'INVALID_PHONE_FORMAT'
        });
      }

      // Check rate limiting for OTP requests
      const rateLimitResult = await otp.checkRateLimit(phone);
      if (!rateLimitResult.allowed) {
        return res.status(429).json({
          success: false,
          error: 'Too many OTP requests. Please try again later.',
          code: 'OTP_RATE_LIMIT_EXCEEDED',
          resetIn: rateLimitResult.resetIn
        });
      }

      // Generate 6-digit OTP
      const otpCode = crypto.randomInt(100000, 999999).toString();

      // Store OTP in Redis (10 minutes expiry)
      const otpStored = await otp.store(phone, otpCode, 600);
      if (!otpStored) {
        throw new Error('Failed to store OTP');
      }

      // TODO: Send OTP via SMS service
      // For development, log the OTP (REMOVE IN PRODUCTION!)
      if (process.env.NODE_ENV === 'development') {
        logger.info(`OTP for ${phone}: ${otpCode}`);
      }

      // TODO: Implement actual SMS sending here
      // await smsService.sendOTP(phone, otpCode);

      res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        data: {
          phone: phone,
          expiresIn: 600, // 10 minutes
          remaining: rateLimitResult.remaining
        }
      });

    } catch (error) {
      logger.error('Start OTP error:', error);
      next(error);
    }
  }

  // Verify OTP and authenticate user
  static async verifyOtp(req, res, next) {
    try {
      const { phone, otp: otpCode } = req.body;

      // Validate input
      if (!phone || !otpCode) {
        return res.status(400).json({
          success: false,
          error: 'Phone number and OTP are required',
          code: 'MISSING_REQUIRED_FIELDS'
        });
      }

      // Verify OTP
      const isValidOtp = await otp.verify(phone, otpCode);
      if (!isValidOtp) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired OTP',
          code: 'INVALID_OTP'
        });
      }

      // Check if user exists
      let user = await User.findByPhone(phone);
      let isNewUser = false;

      if (!user) {
        // Create new user with pending status
        isNewUser = true;
        user = await User.create({
          role: User.ROLES.BUYER, // Default role, can be updated during onboarding
          name: '', // To be filled during onboarding
          phone: phone,
          email: null
        });
      }

      // Generate JWT tokens
      const tokenPayload = {
        userId: user.id,
        phone: user.phone,
        role: user.role,
        kycStatus: user.kycStatus
      };

      const accessToken = jwt.sign(
        tokenPayload,
        process.env.JWT_SECRET,
        { 
          expiresIn: process.env.JWT_EXPIRES_IN || '24h',
          issuer: 'fishmarket-api'
        }
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
        { 
          expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
          issuer: 'fishmarket-api'
        }
      );

      // Store refresh token in Redis
      const { session } = require('../../config/redis');
      await session.set(`refresh:${user.id}`, {
        token: refreshToken,
        createdAt: new Date().toISOString(),
        userAgent: req.get('User-Agent'),
        ip: req.ip
      }, 7 * 24 * 60 * 60); // 7 days

      res.status(200).json({
        success: true,
        message: isNewUser ? 'Account created and logged in successfully' : 'Logged in successfully',
        data: {
          user: user.toJSON(),
          accessToken,
          refreshToken,
          isNewUser,
          requiresOnboarding: !user.name || user.name.trim() === ''
        }
      });

    } catch (error) {
      logger.error('Verify OTP error:', error);
      next(error);
    }
  }

  // Refresh access token
  static async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'Refresh token is required',
          code: 'MISSING_REFRESH_TOKEN'
        });
      }

      // Verify refresh token
      let decoded;
      try {
        decoded = jwt.verify(
          refreshToken,
          process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
        );
      } catch (jwtError) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired refresh token',
          code: 'INVALID_REFRESH_TOKEN'
        });
      }

      // Check if refresh token exists in Redis
      const { session } = require('../../config/redis');
      const storedSession = await session.get(`refresh:${decoded.userId}`);
      
      if (!storedSession || storedSession.token !== refreshToken) {
        return res.status(401).json({
          success: false,
          error: 'Refresh token not found or revoked',
          code: 'REFRESH_TOKEN_REVOKED'
        });
      }

      // Get current user data
      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Generate new access token
      const tokenPayload = {
        userId: user.id,
        phone: user.phone,
        role: user.role,
        kycStatus: user.kycStatus
      };

      const newAccessToken = jwt.sign(
        tokenPayload,
        process.env.JWT_SECRET,
        { 
          expiresIn: process.env.JWT_EXPIRES_IN || '24h',
          issuer: 'fishmarket-api'
        }
      );

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: newAccessToken,
          user: user.toJSON()
        }
      });

    } catch (error) {
      logger.error('Refresh token error:', error);
      next(error);
    }
  }

  // Logout user (revoke refresh token)
  static async logout(req, res, next) {
    try {
      const userId = req.user.userId;

      // Remove refresh token from Redis
      const { session } = require('../../config/redis');
      await session.destroy(`refresh:${userId}`);

      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });

    } catch (error) {
      logger.error('Logout error:', error);
      next(error);
    }
  }

  // Get current user profile
  static async getProfile(req, res, next) {
    try {
      const userId = req.user.userId;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          user: user.toJSON()
        }
      });

    } catch (error) {
      logger.error('Get profile error:', error);
      next(error);
    }
  }

  // Update user profile
  static async updateProfile(req, res, next) {
    try {
      const userId = req.user.userId;
      const { name, email } = req.body;

      // Validate input
      const updateData = {};
      
      if (name !== undefined) {
        if (!name || name.trim().length < 2) {
          return res.status(400).json({
            success: false,
            error: 'Name must be at least 2 characters long',
            code: 'INVALID_NAME'
          });
        }
        updateData.name = name.trim();
      }

      if (email !== undefined) {
        if (email && !email.match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid email format',
            code: 'INVALID_EMAIL'
          });
        }
        updateData.email = email;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid fields to update',
          code: 'NO_UPDATE_FIELDS'
        });
      }

      // Check if email is already taken
      if (updateData.email) {
        const existingUser = await User.findByEmail(updateData.email);
        if (existingUser && existingUser.id !== userId) {
          return res.status(409).json({
            success: false,
            error: 'Email is already registered',
            code: 'EMAIL_ALREADY_EXISTS'
          });
        }
      }

      // Update user
      const updatedUser = await User.update(userId, updateData);
      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: updatedUser.toJSON()
        }
      });

    } catch (error) {
      logger.error('Update profile error:', error);
      next(error);
    }
  }

  // Change user role (admin only)
  static async changeRole(req, res, next) {
    try {
      const { userId, role } = req.body;
      const adminId = req.user.userId;

      // Check if current user is admin
      const admin = await User.findById(adminId);
      if (!admin || admin.role !== User.ROLES.SUPER_ADMIN) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      // Validate role
      if (!Object.values(User.ROLES).includes(role)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid role specified',
          code: 'INVALID_ROLE'
        });
      }

      // Update user role
      const updatedUser = await User.update(userId, { role });
      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      res.status(200).json({
        success: true,
        message: 'User role updated successfully',
        data: {
          user: updatedUser.toJSON()
        }
      });

    } catch (error) {
      logger.error('Change role error:', error);
      next(error);
    }
  }

  // Validate JWT token (for middleware use)
  static async validateToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if user still exists and is active
      const user = await User.findById(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      return {
        valid: true,
        user: decoded
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  // Get user statistics (admin only)
  static async getUserStats(req, res, next) {
    try {
      const adminId = req.user.userId;

      // Check if current user is admin
      const admin = await User.findById(adminId);
      if (!admin || admin.role !== User.ROLES.SUPER_ADMIN) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      const stats = await User.getStatistics();

      res.status(200).json({
        success: true,
        data: {
          statistics: stats
        }
      });

    } catch (error) {
      logger.error('Get user stats error:', error);
      next(error);
    }
  }

  // Resend OTP
  static async resendOtp(req, res, next) {
    try {
      const { phone } = req.body;

      // Validate phone number
      if (!phone || !phone.match(/^\+[1-9]\d{1,14}$/)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid phone number format',
          code: 'INVALID_PHONE_FORMAT'
        });
      }

      // Check rate limiting
      const rateLimitResult = await otp.checkRateLimit(phone);
      if (!rateLimitResult.allowed) {
        return res.status(429).json({
          success: false,
          error: 'Too many OTP requests. Please try again later.',
          code: 'OTP_RATE_LIMIT_EXCEEDED',
          resetIn: rateLimitResult.resetIn
        });
      }

      // Generate new OTP
      const otpCode = crypto.randomInt(100000, 999999).toString();

      // Store OTP in Redis
      const otpStored = await otp.store(phone, otpCode, 600);
      if (!otpStored) {
        throw new Error('Failed to store OTP');
      }

      // Development logging (REMOVE IN PRODUCTION!)
      if (process.env.NODE_ENV === 'development') {
        logger.info(`Resent OTP for ${phone}: ${otpCode}`);
      }

      res.status(200).json({
        success: true,
        message: 'OTP resent successfully',
        data: {
          phone: phone,
          expiresIn: 600,
          remaining: rateLimitResult.remaining
        }
      });

    } catch (error) {
      logger.error('Resend OTP error:', error);
      next(error);
    }
  }

  // Check authentication status
  static async checkAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(200).json({
          success: true,
          data: {
            authenticated: false
          }
        });
      }

      const token = authHeader.substring(7);
      const validation = await AuthController.validateToken(token);

      if (!validation.valid) {
        return res.status(200).json({
          success: true,
          data: {
            authenticated: false,
            error: validation.error
          }
        });
      }

      // Get fresh user data
      const user = await User.findById(validation.user.userId);

      res.status(200).json({
        success: true,
        data: {
          authenticated: true,
          user: user ? user.toJSON() : null
        }
      });

    } catch (error) {
      logger.error('Check auth error:', error);
      res.status(200).json({
        success: true,
        data: {
          authenticated: false,
          error: 'Authentication check failed'
        }
      });
    }
  }
}

module.exports = AuthController;
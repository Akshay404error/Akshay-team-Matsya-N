 
const Joi = require('joi');
const logger = require('../utils/logger');

class ValidationMiddleware {
  /**
   * Validate request body against Joi schema
   */
  static validateBody(schema) {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.body, {
        abortEarly: false, // Return all validation errors
        stripUnknown: true, // Remove unknown fields
        convert: true // Convert strings to numbers, etc.
      });

      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));

        logger.warn('Request body validation failed', {
          url: req.url,
          method: req.method,
          errors,
          body: req.body
        });

        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors
        });
      }

      // Replace req.body with validated and sanitized data
      req.body = value;
      next();
    };
  }

  /**
   * Validate query parameters against Joi schema
   */
  static validateQuery(schema) {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });

      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));

        logger.warn('Query parameters validation failed', {
          url: req.url,
          method: req.method,
          errors,
          query: req.query
        });

        return res.status(400).json({
          success: false,
          error: 'Query validation failed',
          code: 'QUERY_VALIDATION_ERROR',
          details: errors
        });
      }

      // Replace req.query with validated data
      req.query = value;
      next();
    };
  }

  /**
   * Validate URL parameters against Joi schema
   */
  static validateParams(schema) {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.params, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });

      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));

        logger.warn('URL parameters validation failed', {
          url: req.url,
          method: req.method,
          errors,
          params: req.params
        });

        return res.status(400).json({
          success: false,
          error: 'Parameter validation failed',
          code: 'PARAM_VALIDATION_ERROR',
          details: errors
        });
      }

      // Replace req.params with validated data
      req.params = value;
      next();
    };
  }

  /**
   * Validate file uploads
   */
  static validateFiles(options = {}) {
    const {
      maxFiles = 5,
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
      required = false
    } = options;

    return (req, res, next) => {
      const files = req.files || [];
      
      // Check if files are required
      if (required && files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one file is required',
          code: 'FILES_REQUIRED'
        });
      }

      // Check number of files
      if (files.length > maxFiles) {
        return res.status(400).json({
          success: false,
          error: `Maximum ${maxFiles} files allowed`,
          code: 'TOO_MANY_FILES'
        });
      }

      // Validate each file
      for (const file of files) {
        // Check file size
        if (file.size > maxSize) {
          return res.status(400).json({
            success: false,
            error: `File ${file.originalname} exceeds maximum size of ${maxSize / (1024 * 1024)}MB`,
            code: 'FILE_TOO_LARGE'
          });
        }

        // Check file type
        if (!allowedTypes.includes(file.mimetype)) {
          return res.status(400).json({
            success: false,
            error: `File ${file.originalname} has unsupported type. Allowed types: ${allowedTypes.join(', ')}`,
            code: 'INVALID_FILE_TYPE'
          });
        }
      }

      next();
    };
  }

  /**
   * Create custom validation middleware for specific use cases
   */
  static custom(validatorFunction) {
    return async (req, res, next) => {
      try {
        const validationResult = await validatorFunction(req);
        
        if (!validationResult.valid) {
          return res.status(400).json({
            success: false,
            error: validationResult.error || 'Validation failed',
            code: validationResult.code || 'CUSTOM_VALIDATION_ERROR',
            details: validationResult.details
          });
        }

        // Attach any validated data to request
        if (validationResult.data) {
          req.validatedData = validationResult.data;
        }

        next();
      } catch (error) {
        logger.error('Custom validation error:', error);
        res.status(500).json({
          success: false,
          error: 'Validation error occurred',
          code: 'VALIDATION_ERROR'
        });
      }
    };
  }

  /**
   * Validate pagination parameters
   */
  static validatePagination() {
    const paginationSchema = Joi.object({
      limit: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(50)
        .messages({
          'number.integer': 'Limit must be an integer',
          'number.min': 'Limit must be at least 1',
          'number.max': 'Limit cannot exceed 100'
        }),
      offset: Joi.number()
        .integer()
        .min(0)
        .default(0)
        .messages({
          'number.integer': 'Offset must be an integer',
          'number.min': 'Offset cannot be negative'
        }),
      page: Joi.number()
        .integer()
        .min(1)
        .messages({
          'number.integer': 'Page must be an integer',
          'number.min': 'Page must be at least 1'
        }),
      sort: Joi.string()
        .valid('asc', 'desc', 'ASC', 'DESC')
        .default('desc')
        .messages({
          'any.only': 'Sort must be either asc or desc'
        }),
      sortBy: Joi.string()
        .max(50)
        .pattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
        .messages({
          'string.max': 'Sort field name too long',
          'string.pattern.base': 'Invalid sort field name'
        })
    });

    return this.validateQuery(paginationSchema);
  }

  /**
   * Validate coordinates for geospatial queries
   */
  static validateCoordinates() {
    const coordinatesSchema = Joi.object({
      latitude: Joi.number()
        .min(-90)
        .max(90)
        .required()
        .messages({
          'number.min': 'Latitude must be between -90 and 90',
          'number.max': 'Latitude must be between -90 and 90',
          'any.required': 'Latitude is required'
        }),
      longitude: Joi.number()
        .min(-180)
        .max(180)
        .required()
        .messages({
          'number.min': 'Longitude must be between -180 and 180',
          'number.max': 'Longitude must be between -180 and 180',
          'any.required': 'Longitude is required'
        }),
      radius: Joi.number()
        .min(0.1)
        .max(1000)
        .default(50)
        .messages({
          'number.min': 'Radius must be at least 0.1km',
          'number.max': 'Radius cannot exceed 1000km'
        })
    });

    return this.validateQuery(coordinatesSchema);
  }

  /**
   * Validate ID parameters (for routes like /api/catches/:id)
   */
  static validateIdParam(paramName = 'id') {
    const idSchema = Joi.object({
      [paramName]: Joi.number()
        .integer()
        .positive()
        .required()
        .messages({
          'number.integer': `${paramName} must be an integer`,
          'number.positive': `${paramName} must be positive`,
          'any.required': `${paramName} is required`
        })
    });

    return this.validateParams(idSchema);
  }

  /**
   * Validate date range parameters
   */
  static validateDateRange() {
    const dateRangeSchema = Joi.object({
      startDate: Joi.date()
        .iso()
        .messages({
          'date.format': 'Start date must be in ISO format (YYYY-MM-DD)'
        }),
      endDate: Joi.date()
        .iso()
        .min(Joi.ref('startDate'))
        .messages({
          'date.format': 'End date must be in ISO format (YYYY-MM-DD)',
          'date.min': 'End date must be after start date'
        }),
      timeRange: Joi.string()
        .valid('today', 'yesterday', 'last_week', 'last_month', 'last_year')
        .messages({
          'any.only': 'Invalid time range option'
        })
    });

    return this.validateQuery(dateRangeSchema);
  }

  /**
   * Sanitize and validate text input to prevent XSS
   */
  static sanitizeText() {
    return (req, res, next) => {
      const sanitizeValue = (value) => {
        if (typeof value === 'string') {
          // Remove potential XSS characters
          return value
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .trim();
        }
        if (typeof value === 'object' && value !== null) {
          const sanitized = {};
          for (const [key, val] of Object.entries(value)) {
            sanitized[key] = sanitizeValue(val);
          }
          return sanitized;
        }
        return value;
      };

      // Sanitize body
      if (req.body) {
        req.body = sanitizeValue(req.body);
      }

      // Sanitize query
      if (req.query) {
        req.query = sanitizeValue(req.query);
      }

      next();
    };
  }

  /**
   * Validate phone number format specifically for Indian numbers
   */
  static validateIndianPhone() {
    const phoneSchema = Joi.object({
      phone: Joi.string()
        .pattern(/^\+91[6-9]\d{9}$/)
        .required()
        .messages({
          'string.pattern.base': 'Phone number must be a valid Indian mobile number (+91XXXXXXXXXX)',
          'any.required': 'Phone number is required'
        })
    });

    return this.validateBody(phoneSchema);
  }

  /**
   * Validate Aadhaar number format
   */
  static validateAadhaar() {
    return (req, res, next) => {
      if (req.body.document_type === 'aadhaar' && req.body.document_number) {
        const aadhaarPattern = /^\d{4}\s?\d{4}\s?\d{4}$/;
        const cleanAadhaar = req.body.document_number.replace(/\s/g, '');
        
        if (!aadhaarPattern.test(req.body.document_number) || cleanAadhaar.length !== 12) {
          return res.status(400).json({
            success: false,
            error: 'Invalid Aadhaar number format',
            code: 'INVALID_AADHAAR'
          });
        }

        // Basic Aadhaar validation algorithm
        const aadhaarArray = cleanAadhaar.split('').map(Number);
        const multiplicationTable = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4];
        let sum = 0;

        for (let i = 0; i < 11; i++) {
          sum += aadhaarArray[i] * multiplicationTable[i];
        }

        const checkDigit = sum % 11;
        const lastDigit = checkDigit < 2 ? checkDigit : 11 - checkDigit;

        if (lastDigit !== aadhaarArray[11]) {
          return res.status(400).json({
            success: false,
            error: 'Invalid Aadhaar number',
            code: 'INVALID_AADHAAR_CHECKSUM'
          });
        }
      }
      next();
    };
  }

  /**
   * Validate PAN number format
   */
  static validatePAN() {
    return (req, res, next) => {
      if (req.body.document_type === 'pan' && req.body.document_number) {
        const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        
        if (!panPattern.test(req.body.document_number.toUpperCase())) {
          return res.status(400).json({
            success: false,
            error: 'Invalid PAN number format (should be ABCDE1234F)',
            code: 'INVALID_PAN'
          });
        }

        // Convert to uppercase
        req.body.document_number = req.body.document_number.toUpperCase();
      }
      next();
    };
  }

  /**
   * Rate limiting validation helper
   */
  static checkRateLimit(keyGenerator, maxRequests = 100, windowMs = 15 * 60 * 1000) {
    const requests = new Map();

    return (req, res, next) => {
      const key = typeof keyGenerator === 'function' ? keyGenerator(req) : req.ip;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Clean old entries
      if (requests.has(key)) {
        const userRequests = requests.get(key);
        requests.set(key, userRequests.filter(time => time > windowStart));
      }

      const userRequests = requests.get(key) || [];
      
      if (userRequests.length >= maxRequests) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((userRequests[0] + windowMs - now) / 1000)
        });
      }

      userRequests.push(now);
      requests.set(key, userRequests);
      
      next();
    };
  }

  /**
   * Validate request content type
   */
  static validateContentType(expectedType = 'application/json') {
    return (req, res, next) => {
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const contentType = req.headers['content-type'];
        
        if (!contentType || !contentType.includes(expectedType)) {
          return res.status(400).json({
            success: false,
            error: `Invalid content type. Expected ${expectedType}`,
            code: 'INVALID_CONTENT_TYPE'
          });
        }
      }
      next();
    };
  }
}

module.exports = ValidationMiddleware;
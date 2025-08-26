const Joi = require('joi');

// Phone number validation (international format)
const phoneSchema = Joi.string()
  .pattern(/^\+[1-9]\d{1,14}$/)
  .required()
  .messages({
    'string.pattern.base': 'Phone number must be in international format (e.g., +919999999999)',
    'any.required': 'Phone number is required'
  });

// OTP validation
const otpSchema = Joi.string()
  .length(6)
  .pattern(/^\d{6}$/)
  .required()
  .messages({
    'string.length': 'OTP must be exactly 6 digits',
    'string.pattern.base': 'OTP must contain only numbers',
    'any.required': 'OTP is required'
  });

// Email validation
const emailSchema = Joi.string()
  .email()
  .max(255)
  .allow(null, '')
  .messages({
    'string.email': 'Invalid email format',
    'string.max': 'Email must not exceed 255 characters'
  });

// Name validation
const nameSchema = Joi.string()
  .min(2)
  .max(255)
  .pattern(/^[a-zA-Z\s.'-]+$/)
  .required()
  .messages({
    'string.min': 'Name must be at least 2 characters long',
    'string.max': 'Name must not exceed 255 characters',
    'string.pattern.base': 'Name can only contain letters, spaces, periods, hyphens, and apostrophes',
    'any.required': 'Name is required'
  });

// User role validation
const roleSchema = Joi.string()
  .valid('fisher', 'society_admin', 'buyer', 'delivery_partner', 'super_admin')
  .required()
  .messages({
    'any.only': 'Invalid user role',
    'any.required': 'Role is required'
  });

// OTP Start Schema
const otpStartSchema = Joi.object({
  phone: phoneSchema
});

// OTP Verify Schema
const otpVerifySchema = Joi.object({
  phone: phoneSchema,
  otp: otpSchema
});

// Refresh Token Schema
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string()
    .required()
    .messages({
      'any.required': 'Refresh token is required'
    })
});

// Update Profile Schema
const updateProfileSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(255)
    .pattern(/^[a-zA-Z\s.'-]+$/)
    .messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name must not exceed 255 characters',
      'string.pattern.base': 'Name can only contain letters, spaces, periods, hyphens, and apostrophes'
    }),
  email: emailSchema
}).min(1).messages({
  'object.min': 'At least one field (name or email) must be provided'
});

// Change Role Schema
const changeRoleSchema = Joi.object({
  userId: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      'number.integer': 'User ID must be an integer',
      'number.positive': 'User ID must be positive',
      'any.required': 'User ID is required'
    }),
  role: roleSchema
});

// User Registration Schema (for manual registration)
const userRegistrationSchema = Joi.object({
  role: roleSchema,
  name: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
  society_id: Joi.number()
    .integer()
    .positive()
    .allow(null)
    .messages({
      'number.integer': 'Society ID must be an integer',
      'number.positive': 'Society ID must be positive'
    })
});

// User Update Schema (admin use)
const userUpdateSchema = Joi.object({
  name: nameSchema.optional(),
  email: emailSchema,
  kyc_status: Joi.string()
    .valid('pending', 'under_review', 'approved', 'rejected')
    .messages({
      'any.only': 'Invalid KYC status'
    }),
  society_id: Joi.number()
    .integer()
    .positive()
    .allow(null)
    .messages({
      'number.integer': 'Society ID must be an integer',
      'number.positive': 'Society ID must be positive'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Password Schema (if password authentication is added later)
const passwordSchema = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
  .messages({
    'string.min': 'Password must be at least 8 characters long',
    'string.max': 'Password must not exceed 128 characters',
    'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  });

// Login with Password Schema
const passwordLoginSchema = Joi.object({
  phone: phoneSchema,
  password: passwordSchema.required()
});

// KYC Document Types
const kycDocumentTypeSchema = Joi.string()
  .valid('aadhaar', 'pan', 'driving_license', 'passport', 'voter_id')
  .required()
  .messages({
    'any.only': 'Invalid document type',
    'any.required': 'Document type is required'
  });

// KYC Submission Schema
const kycSubmissionSchema = Joi.object({
  document_type: kycDocumentTypeSchema,
  document_number: Joi.string()
    .min(8)
    .max(50)
    .pattern(/^[A-Za-z0-9]+$/)
    .required()
    .messages({
      'string.min': 'Document number must be at least 8 characters',
      'string.max': 'Document number must not exceed 50 characters',
      'string.pattern.base': 'Document number can only contain letters and numbers',
      'any.required': 'Document number is required'
    }),
  front_image: Joi.string()
    .uri()
    .required()
    .messages({
      'string.uri': 'Front image must be a valid URL',
      'any.required': 'Front image is required'
    }),
  back_image: Joi.string()
    .uri()
    .allow(null, '')
    .messages({
      'string.uri': 'Back image must be a valid URL'
    }),
  selfie_image: Joi.string()
    .uri()
    .required()
    .messages({
      'string.uri': 'Selfie image must be a valid URL',
      'any.required': 'Selfie image is required'
    })
});

// KYC Review Schema
const kycReviewSchema = Joi.object({
  userId: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      'number.integer': 'User ID must be an integer',
      'number.positive': 'User ID must be positive',
      'any.required': 'User ID is required'
    }),
  status: Joi.string()
    .valid('approved', 'rejected')
    .required()
    .messages({
      'any.only': 'Status must be either approved or rejected',
      'any.required': 'Status is required'
    }),
  notes: Joi.string()
    .max(1000)
    .allow('', null)
    .messages({
      'string.max': 'Notes must not exceed 1000 characters'
    })
});

// Query Parameters Schemas
const userListQuerySchema = Joi.object({
  role: Joi.string()
    .valid('fisher', 'society_admin', 'buyer', 'delivery_partner', 'super_admin'),
  kyc_status: Joi.string()
    .valid('pending', 'under_review', 'approved', 'rejected'),
  society_id: Joi.number().integer().positive(),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(50),
  offset: Joi.number()
    .integer()
    .min(0)
    .default(0),
  search: Joi.string()
    .max(255)
    .allow('')
});

module.exports = {
  // Basic validations
  phoneSchema,
  otpSchema,
  emailSchema,
  nameSchema,
  roleSchema,
  passwordSchema,
  
  // Request validations
  otpStartSchema,
  otpVerifySchema,
  refreshTokenSchema,
  updateProfileSchema,
  changeRoleSchema,
  userRegistrationSchema,
  userUpdateSchema,
  passwordLoginSchema,
  
  // KYC validations
  kycDocumentTypeSchema,
  kycSubmissionSchema,
  kycReviewSchema,
  
  // Query validations
  userListQuerySchema
};
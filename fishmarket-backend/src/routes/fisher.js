const express = require('express');
const { body, query: queryValidator, validationResult } = require('express-validator');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const { query } = require('../config/database');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { authMiddleware, authorize, optionalAuth } = require('../middleware/auth');
const { cache } = require('../config/redis');
const logger = require('../config/logger');

const router = express.Router();

// Multer configuration for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 5
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new AppError('Only image files are allowed', 400), false);
    }
  }
});

// Image processing helper
const processImage = async (buffer, size = 800) => {
  return await sharp(buffer)
    .resize(size, size, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 85 })
    .toBuffer();
};

// Validation middleware
const validateFishListing = [
  body('name').trim().isLength({ min: 2 }).withMessage('Fish name must be at least 2 characters'),
  body('species').trim().isLength({ min: 2 }).withMessage('Species must be at least 2 characters'),
  body('quantity').isFloat({ min: 0.1 }).withMessage('Quantity must be greater than 0'),
  body('unit').isIn(['kg', 'piece', 'box']).withMessage('Valid unit is required'),
  body('quality').isIn(['premium', 'standard', 'economy']).withMessage('Valid quality grade is required'),
  body('marketId').isUUID().withMessage('Valid market ID is required'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description too long'),
  body('minPrice').optional().isFloat({ min: 0 }).withMessage('Minimum price must be positive'),
  body('catchDate').isISO8601().withMessage('Valid catch date is required'),
  body('location').optional().isObject().withMessage('Location must be an object')
];

// GET /api/fish - Get all fish listings
router.get('/', optionalAuth, [
  queryValidator('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  queryValidator('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1-50'),
  queryValidator('species').optional().trim(),
  queryValidator('quality').optional().isIn(['premium', 'standard', 'economy']),
  queryValidator('marketId').optional().isUUID(),
  queryValidator('minPrice').optional().isFloat({ min: 0 }),
  queryValidator('maxPrice').optional().isFloat({ min: 0 }),
  queryValidator('sortBy').optional().isIn(['price', 'quantity', 'catchDate', 'createdAt']),
  queryValidator('sortOrder').optional().isIn(['asc', 'desc']),
  queryValidator('lat').optional().isFloat(),
  queryValidator('lng').optional().isFloat(),
  queryValidator('radius').optional().isFloat({ min: 0, max: 1000 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const {
    page = 1,
    limit = 20,
    species,
    quality,
    marketId,
    minPrice,
    maxPrice,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    lat,
    lng,
    radius = 50
  } = req.query;

  const offset = (page - 1) * limit;

  // Build query
  let whereConditions = ['f.is_active = true', 'f.status = $1'];
  let queryParams = ['available'];
  let paramCount = 2;

  if (species) {
    whereConditions.push(`f.species ILIKE $${paramCount}`);
    queryParams.push(`%${species}%`);
    paramCount++;
  }

  if (quality) {
    whereConditions.push(`f.quality = $${paramCount}`);
    queryParams.push(quality);
    paramCount++;
  }

  if (marketId) {
    whereConditions.push(`f.market_id = $${paramCount}`);
    queryParams.push(marketId);
    paramCount++;
  }

  if (minPrice) {
    whereConditions.push(`f.min_price >= $${paramCount}`);
    queryParams.push(minPrice);
    paramCount++;
  }

  if (maxPrice) {
    whereConditions.push(`f.min_price <= $${paramCount}`);
    queryParams.push(maxPrice);
    paramCount++;
  }

  // Location-based filtering
  let distanceSelect = '';
  let distanceOrderBy = '';
  if (lat && lng) {
    whereConditions.push(`ST_DWithin(m.location, ST_SetSRID(ST_MakePoint($${paramCount}, $${paramCount + 1}), 4326), $${paramCount + 2})`);
    queryParams.push(lng, lat, radius * 1000); // Convert km to meters
    paramCount += 3;

    distanceSelect = `, ST_Distance(m.location, ST_SetSRID(ST_MakePoint($${lng}, $${lat}), 4326)) as distance`;
    distanceOrderBy = ', distance';
  }

  // Build ORDER BY clause
  const sortMapping = {
    price: 'f.min_price',
    quantity: 'f.quantity',
    catchDate: 'f.catch_date',
    createdAt: 'f.created_at'
  };

  const orderBy = `${sortMapping[sortBy]} ${sortOrder.toUpperCase()}${distanceOrderBy}`;

  const fishQuery = `
    SELECT 
      f.id,
      f.name,
      f.species,
      f.quantity,
      f.unit,
      f.quality,
      f.description,
      f.min_price,
      f.catch_date,
      f.created_at,
      f.images,
      u.first_name as fisherman_first_name,
      u.last_name as fisherman_last_name,
      u.phone as fisherman_phone,
      m.name as market_name,
      ST_X(m.location) as market_lng,
      ST_Y(m.location) as market_lat
      ${distanceSelect}
    FROM fish f
    JOIN users u ON f.fisherman_id = u.id
    JOIN markets m ON f.market_id = m.id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;

  queryParams.push(limit, offset);

  // Count query for pagination
  const countQuery = `
    SELECT COUNT(*) as total
    FROM fish f
    JOIN markets m ON f.market_id = m.id
    WHERE ${whereConditions.slice(0, -2).join(' AND ')} AND f.is_active = true AND f.status = 'available'
  `;

  const [fishResult, countResult] = await Promise.all([
    query(fishQuery, queryParams),
    query(countQuery, queryParams.slice(0, -2))
  ]);

  const totalItems = parseInt(countResult.rows[0].total);
  const totalPages = Math.ceil(totalItems / limit);

  res.json({
    success: true,
    data: {
      fish: fishResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        species: row.species,
        quantity: parseFloat(row.quantity),
        unit: row.unit,
        quality: row.quality,
        description: row.description,
        minPrice: parseFloat(row.min_price),
        catchDate: row.catch_date,
        createdAt: row.created_at,
        images: row.images || [],
        fisherman: {
          name: `${row.fisherman_first_name} ${row.fisherman_last_name}`,
          phone: row.fisherman_phone
        },
        market: {
          name: row.market_name,
          location: {
            lat: parseFloat(row.market_lat),
            lng: parseFloat(row.market_lng)
          }
        },
        ...(row.distance && { distance: parseFloat(row.distance) / 1000 }) // Convert to km
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems,
        itemsPerPage: parseInt(limit),
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    }
  });
}));

// GET /api/fish/:id - Get fish listing by ID
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Try to get from cache first
  const cacheKey = `fish:${id}`;
  const cachedFish = await cache.get(cacheKey);
  
  if (cachedFish) {
    return res.json({
      success: true,
      data: { fish: cachedFish }
    });
  }

  const fishResult = await query(`
    SELECT 
      f.*,
      u.first_name as fisherman_first_name,
      u.last_name as fisherman_last_name,
      u.phone as fisherman_phone,
      u.email as fisherman_email,
      m.name as market_name,
      m.address as market_address,
      ST_X(m.location) as market_lng,
      ST_Y(m.location) as market_lat,
      m.operating_hours as market_hours
    FROM fish f
    JOIN users u ON f.fisherman_id = u.id
    JOIN markets m ON f.market_id = m.id
    WHERE f.id = $1 AND f.is_active = true
  `, [id]);

  if (fishResult.rows.length === 0) {
    throw new AppError('Fish listing not found', 404);
  }

  const fish = fishResult.rows[0];
  const fishData = {
    id: fish.id,
    name: fish.name,
    species: fish.species,
    quantity: parseFloat(fish.quantity),
    unit: fish.unit,
    quality: fish.quality,
    description: fish.description,
    minPrice: parseFloat(fish.min_price),
    catchDate: fish.catch_date,
    status: fish.status,
    createdAt: fish.created_at,
    updatedAt: fish.updated_at,
    images: fish.images || [],
    fisherman: {
      name: `${fish.fisherman_first_name} ${fish.fisherman_last_name}`,
      phone: fish.fisherman_phone,
      ...(req.user && { email: fish.fisherman_email })
    },
    market: {
      name: fish.market_name,
      address: fish.market_address,
      location: {
        lat: parseFloat(fish.market_lat),
        lng: parseFloat(fish.market_lng)
      },
      operatingHours: fish.market_hours
    }
  };

  // Cache for 10 minutes
  await cache.set(cacheKey, fishData, 600);

  res.json({
    success: true,
    data: { fish: fishData }
  });
}));

// POST /api/fish - Create fish listing (fisherman only)
router.post('/', authMiddleware, authorize('fisherman'), upload.array('images', 5), validateFishListing, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const {
    name,
    species,
    quantity,
    unit,
    quality,
    marketId,
    description,
    minPrice,
    catchDate,
    location
  } = req.body;

  // Verify market exists and is active
  const marketResult = await query('SELECT id FROM markets WHERE id = $1 AND is_active = true', [marketId]);
  if (marketResult.rows.length === 0) {
    throw new AppError('Market not found or inactive', 400);
  }

  // Process uploaded images
  let imageUrls = [];
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      try {
        const processedImage = await processImage(file.buffer);
        // In production, upload to S3 or your preferred storage
        // For now, we'll store as base64 (not recommended for production)
        const imageUrl = `data:image/jpeg;base64,${processedImage.toString('base64')}`;
        imageUrls.push(imageUrl);
      } catch (error) {
        logger.error('Image processing error:', error);
        throw new AppError('Image processing failed', 500);
      }
    }
  }

  const fishId = uuidv4();

  const fishResult = await query(`
    INSERT INTO fish (
      id, fisherman_id, market_id, name, species, quantity, unit, quality,
      description, min_price, catch_date, images, location, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'available', NOW(), NOW())
    RETURNING *
  `, [
    fishId,
    req.user.id,
    marketId,
    name,
    species,
    quantity,
    unit,
    quality,
    description,
    minPrice,
    catchDate,
    JSON.stringify(imageUrls),
    location ? JSON.stringify(location) : null
  ]);

  const fish = fishResult.rows[0];

  logger.info(`Fish listing created: ${name} by ${req.user.email}`);

  res.status(201).json({
    success: true,
    message: 'Fish listing created successfully',
    data: {
      fish: {
        id: fish.id,
        name: fish.name,
        species: fish.species,
        quantity: parseFloat(fish.quantity),
        unit: fish.unit,
        quality: fish.quality,
        description: fish.description,
        minPrice: parseFloat(fish.min_price),
        catchDate: fish.catch_date,
        status: fish.status,
        images: fish.images || [],
        createdAt: fish.created_at
      }
    }
  });
}));

// PUT /api/fish/:id - Update fish listing (owner only)
router.put('/:id', authMiddleware, authorize('fisherman'), upload.array('images', 5), [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Fish name must be at least 2 characters'),
  body('quantity').optional().isFloat({ min: 0.1 }).withMessage('Quantity must be greater than 0'),
  body('quality').optional().isIn(['premium', 'standard', 'economy']),
  body('minPrice').optional().isFloat({ min: 0 }),
  body('status').optional().isIn(['available', 'sold', 'reserved'])
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { id } = req.params;

  // Check if fish exists and belongs to user
  const fishResult = await query('SELECT * FROM fish WHERE id = $1 AND fisherman_id = $2 AND is_active = true', [id, req.user.id]);
  if (fishResult.rows.length === 0) {
    throw new AppError('Fish listing not found or access denied', 404);
  }

  const currentFish = fishResult.rows[0];
  const updates = [];
  const values = [];
  let paramCount = 1;

  // Process updates
  const allowedFields = ['name', 'quantity', 'quality', 'description', 'minPrice', 'status'];
  const fieldMapping = {
    minPrice: 'min_price'
  };

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      const dbField = fieldMapping[field] || field.toLowerCase();
      updates.push(`${dbField} = $${paramCount}`);
      values.push(req.body[field]);
      paramCount++;
    }
  }

  // Handle image updates
  if (req.files && req.files.length > 0) {
    let imageUrls = [...(currentFish.images || [])];
    
    for (const file of req.files) {
      try {
        const processedImage = await processImage(file.buffer);
        const imageUrl = `data:image/jpeg;base64,${processedImage.toString('base64')}`;
        imageUrls.push(imageUrl);
      } catch (error) {
        logger.error('Image processing error:', error);
        throw new AppError('Image processing failed', 500);
      }
    }
    
    updates.push(`images = $${paramCount}`);
    values.push(JSON.stringify(imageUrls));
    paramCount++;
  }

  if (updates.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No valid fields to update'
    });
  }

  updates.push('updated_at = NOW()');
  values.push(id);

  const updatedFishResult = await query(`
    UPDATE fish 
    SET ${updates.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `, values);

  const updatedFish = updatedFishResult.rows[0];

  // Clear cache
  await cache.del(`fish:${id}`);

  res.json({
    success: true,
    message: 'Fish listing updated successfully',
    data: {
      fish: {
        id: updatedFish.id,
        name: updatedFish.name,
        species: updatedFish.species,
        quantity: parseFloat(updatedFish.quantity),
        unit: updatedFish.unit,
        quality: updatedFish.quality,
        description: updatedFish.description,
        minPrice: parseFloat(updatedFish.min_price),
        status: updatedFish.status,
        images: updatedFish.images || [],
        updatedAt: updatedFish.updated_at
      }
    }
  });
}));

// DELETE /api/fish/:id - Delete fish listing (owner only)
router.delete('/:id', authMiddleware, authorize('fisherman'), asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if fish exists and belongs to user
  const fishResult = await query('SELECT id FROM fish WHERE id = $1 AND fisherman_id = $2 AND is_active = true', [id, req.user.id]);
  if (fishResult.rows.length === 0) {
    throw new AppError('Fish listing not found or access denied', 404);
  }

  // Soft delete
  await query('UPDATE fish SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);

  // Clear cache
  await cache.del(`fish:${id}`);

  logger.info(`Fish listing deleted: ${id} by ${req.user.email}`);

  res.json({
    success: true,
    message: 'Fish listing deleted successfully'
  });
}));

module.exports = router;
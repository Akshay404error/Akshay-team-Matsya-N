const express = require('express');
const { query: queryValidator, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { asyncHandler } = require('../middleware/errorHandler');
const { optionalAuth } = require('../middleware/auth');
const { cache } = require('../config/redis');
const logger = require('../config/logger');

const router = express.Router();

// GET /api/markets - Get all markets
router.get('/', optionalAuth, [
  queryValidator('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  queryValidator('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1-50'),
  queryValidator('search').optional().trim(),
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
    search,
    lat,
    lng,
    radius = 50
  } = req.query;

  const offset = (page - 1) * limit;

  // Build query
  let whereConditions = ['is_active = true'];
  let queryParams = [];
  let paramCount = 1;

  if (search) {
    whereConditions.push(`(name ILIKE $${paramCount} OR address ILIKE $${paramCount})`);
    queryParams.push(`%${search}%`);
    paramCount++;
  }

  // Location-based filtering
  let distanceSelect = '';
  let distanceOrderBy = '';
  if (lat && lng) {
    whereConditions.push(`ST_DWithin(location, ST_SetSRID(ST_MakePoint($${paramCount}, $${paramCount + 1}), 4326), $${paramCount + 2})`);
    queryParams.push(lng, lat, radius * 1000); // Convert km to meters
    paramCount += 3;

    distanceSelect = `, ST_Distance(location, ST_SetSRID(ST_MakePoint($${lng}, $${lat}), 4326)) as distance`;
    distanceOrderBy = ', distance';
  }

  const marketsQuery = `
    SELECT 
      id,
      name,
      address,
      ST_X(location) as lng,
      ST_Y(location) as lat,
      phone,
      email,
      description,
      operating_hours,
      facilities,
      created_at
      ${distanceSelect}
    FROM markets
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY name ASC${distanceOrderBy}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;

  queryParams.push(limit, offset);

  // Count query for pagination
  const countQuery = `
    SELECT COUNT(*) as total
    FROM markets
    WHERE ${whereConditions.join(' AND ')}
  `;

  const [marketsResult, countResult] = await Promise.all([
    query(marketsQuery, queryParams),
    query(countQuery, queryParams.slice(0, -2))
  ]);

  const totalItems = parseInt(countResult.rows[0].total);
  const totalPages = Math.ceil(totalItems / limit);

  res.json({
    success: true,
    data: {
      markets: marketsResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        address: row.address,
        location: {
          lat: parseFloat(row.lat),
          lng: parseFloat(row.lng)
        },
        phone: row.phone,
        email: row.email,
        description: row.description,
        operatingHours: row.operating_hours,
        facilities: row.facilities || [],
        createdAt: row.created_at,
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

// GET /api/markets/nearby - Find nearby markets
router.get('/nearby', [
  queryValidator('lat').isFloat().withMessage('Valid latitude is required'),
  queryValidator('lng').isFloat().withMessage('Valid longitude is required'),
  queryValidator('radius').optional().isFloat({ min: 0, max: 1000 }).withMessage('Radius must be between 0-1000 km'),
  queryValidator('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1-50')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { lat, lng, radius = 50, limit = 10 } = req.query;

  const cacheKey = `markets:nearby:${lat}:${lng}:${radius}:${limit}`;
  const cachedResult = await cache.get(cacheKey);
  
  if (cachedResult) {
    return res.json({
      success: true,
      data: { markets: cachedResult }
    });
  }

  const marketsResult = await query(`
    SELECT 
      id,
      name,
      address,
      ST_X(location) as lng,
      ST_Y(location) as lat,
      phone,
      email,
      description,
      operating_hours,
      facilities,
      ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)) as distance
    FROM markets
    WHERE is_active = true
    AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326), $3)
    ORDER BY distance
    LIMIT $4
  `, [lng, lat, radius * 1000, limit]);

  const markets = marketsResult.rows.map(row => ({
    id: row.id,
    name: row.name,
    address: row.address,
    location: {
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng)
    },
    phone: row.phone,
    email: row.email,
    description: row.description,
    operatingHours: row.operating_hours,
    facilities: row.facilities || [],
    distance: parseFloat(row.distance) / 1000 // Convert to km
  }));

  // Cache for 30 minutes
  await cache.set(cacheKey, markets, 1800);

  res.json({
    success: true,
    data: { markets }
  });
}));

// GET /api/markets/:id - Get market by ID
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const cacheKey = `market:${id}`;
  const cachedMarket = await cache.get(cacheKey);
  
  if (cachedMarket) {
    return res.json({
      success: true,
      data: { market: cachedMarket }
    });
  }

  const marketResult = await query(`
    SELECT 
      m.*,
      ST_X(m.location) as lng,
      ST_Y(m.location) as lat,
      COUNT(f.id) as active_fish_count,
      COUNT(a.id) as active_auctions_count
    FROM markets m
    LEFT JOIN fish f ON m.id = f.market_id AND f.is_active = true AND f.status = 'available'
    LEFT JOIN auctions a ON f.id = a.fish_id AND a.status = 'active'
    WHERE m.id = $1 AND m.is_active = true
    GROUP BY m.id
  `, [id]);

  if (marketResult.rows.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'Market not found'
    });
  }

  const market = marketResult.rows[0];
  const marketData = {
    id: market.id,
    name: market.name,
    address: market.address,
    location: {
      lat: parseFloat(market.lat),
      lng: parseFloat(market.lng)
    },
    phone: market.phone,
    email: market.email,
    description: market.description,
    operatingHours: market.operating_hours,
    facilities: market.facilities || [],
    activeFishCount: parseInt(market.active_fish_count),
    activeAuctionsCount: parseInt(market.active_auctions_count),
    createdAt: market.created_at,
    updatedAt: market.updated_at
  };

  // Cache for 15 minutes
  await cache.set(cacheKey, marketData, 900);

  res.json({
    success: true,
    data: { market: marketData }
  });
}));

// GET /api/markets/:id/fish - Get fish listings in a market
router.get('/:id/fish', [
  queryValidator('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  queryValidator('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1-50'),
  queryValidator('species').optional().trim(),
  queryValidator('quality').optional().isIn(['premium', 'standard', 'economy']),
  queryValidator('sortBy').optional().isIn(['price', 'quantity', 'catchDate', 'createdAt']),
  queryValidator('sortOrder').optional().isIn(['asc', 'desc'])
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
  const {
    page = 1,
    limit = 20,
    species,
    quality,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Verify market exists
  const marketExists = await query('SELECT id FROM markets WHERE id = $1 AND is_active = true', [id]);
  if (marketExists.rows.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'Market not found'
    });
  }

  const offset = (page - 1) * limit;
  let whereConditions = ['f.market_id = $1', 'f.is_active = true', 'f.status = $2'];
  let queryParams = [id, 'available'];
  let paramCount = 3;

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

  const sortMapping = {
    price: 'f.min_price',
    quantity: 'f.quantity',
    catchDate: 'f.catch_date',
    createdAt: 'f.created_at'
  };

  const orderBy = `${sortMapping[sortBy]} ${sortOrder.toUpperCase()}`;

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
      u.phone as fisherman_phone
    FROM fish f
    JOIN users u ON f.fisherman_id = u.id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;

  queryParams.push(limit, offset);

  const fishResult = await query(fishQuery, queryParams);

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
        }
      }))
    }
  });
}));

module.exports = router;
const { Pool } = require('pg');
const logger = require('../utils/logger');

// Database configuration based on environment
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'fishmarket_dev',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  
  // Connection pool settings
  min: parseInt(process.env.DB_POOL_MIN) || 2,
  max: parseInt(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  
  // Enable PostGIS support
  application_name: 'fishmarket-backend',
};

// Create connection pool
const pool = new Pool(dbConfig);

// Handle pool events
pool.on('connect', (client) => {
  logger.info('New PostgreSQL client connected');
});

pool.on('error', (err, client) => {
  logger.error('PostgreSQL pool error:', err);
  process.exit(-1);
});

// Test database connection and PostGIS availability
const testConnection = async () => {
  try {
    const client = await pool.connect();
    
    // Test basic connection
    const result = await client.query('SELECT NOW()');
    logger.info('Database connected at:', result.rows[0].now);
    
    // Test PostGIS extension
    try {
      const postgisResult = await client.query('SELECT PostGIS_Version()');
      logger.info('PostGIS version:', postgisResult.rows[0].postgis_version);
    } catch (postgisErr) {
      logger.warn('PostGIS extension not found. Please install PostGIS.');
    }
    
    client.release();
    return true;
  } catch (err) {
    logger.error('Database connection failed:', err.message);
    return false;
  }
};

// Query helper with error handling
const query = async (text, params = []) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug('Query executed', {
      query: text,
      duration: `${duration}ms`,
      rows: result.rowCount
    });
    
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    logger.error('Query failed', {
      query: text,
      duration: `${duration}ms`,
      error: err.message
    });
    throw err;
  }
};

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Geospatial query helpers
const geoQuery = {
  // Find points within radius
  withinRadius: (tableName, lat, lon, radiusKm, columns = '*') => {
    return `
      SELECT ${columns}, 
             ST_Distance(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 as distance_km
      FROM ${tableName}
      WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3 * 1000)
      ORDER BY distance_km ASC
    `;
  },
  
  // Check if point is within geofence
  withinGeofence: (tableName, geofenceColumn, lat, lon) => {
    return `
      SELECT * FROM ${tableName}
      WHERE ST_Contains(${geofenceColumn}, ST_SetSRID(ST_MakePoint($1, $2), 4326))
    `;
  },
  
  // Create point from lat/lon
  makePoint: (lat, lon) => {
    return `ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`;
  }
};

// Graceful shutdown
const closePool = async () => {
  try {
    await pool.end();
    logger.info('Database pool closed');
  } catch (err) {
    logger.error('Error closing database pool:', err);
  }
};

// Handle process termination
process.on('SIGINT', closePool);
process.on('SIGTERM', closePool);

module.exports = {
  pool,
  query,
  transaction,
  geoQuery,
  testConnection,
  closePool
};
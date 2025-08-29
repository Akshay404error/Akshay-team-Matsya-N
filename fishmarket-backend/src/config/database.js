const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', () => {
  logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Query helper function
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug(`Executed query: ${text} (${duration}ms)`);
    return result;
  } catch (error) {
    logger.error(`Query error: ${error.message}`);
    throw error;
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
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Initialize database with PostGIS
const initializeDatabase = async () => {
  try {
    // Enable PostGIS extension
    await query('CREATE EXTENSION IF NOT EXISTS postgis;');
    await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    
    logger.info('Database initialized with PostGIS extension');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
};

module.exports = {
  pool,
  query,
  transaction,
  initializeDatabase
};
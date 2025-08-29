const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'fishmarket_db'
};

// Admin config for creating database
const adminConfig = {
  ...dbConfig,
  database: 'postgres' // Connect to default postgres database
};

class DatabaseSetup {
  constructor() {
    this.adminPool = new Pool(adminConfig);
    this.dbPool = null;
  }

  async createDatabase() {
    try {
      console.log('🔍 Checking if database exists...');
      
      // Check if database exists
      const checkResult = await this.adminPool.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [dbConfig.database]
      );

      if (checkResult.rows.length === 0) {
        console.log(`📦 Creating database: ${dbConfig.database}`);
        await this.adminPool.query(`CREATE DATABASE "${dbConfig.database}"`);
        console.log('✅ Database created successfully');
      } else {
        console.log('✅ Database already exists');
      }
    } catch (error) {
      console.error('❌ Error creating database:', error.message);
      throw error;
    }
  }

  async enableExtensions() {
    try {
      console.log('🔧 Enabling PostgreSQL extensions...');
      
      this.dbPool = new Pool(dbConfig);
      
      // Enable PostGIS extension
      await this.dbPool.query('CREATE EXTENSION IF NOT EXISTS postgis');
      console.log('✅ PostGIS extension enabled');

      // Enable other useful extensions
      await this.dbPool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      console.log('✅ UUID extension enabled');

      await this.dbPool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      console.log('✅ pg_trgm extension enabled');

    } catch (error) {
      console.error('❌ Error enabling extensions:', error.message);
      throw error;
    }
  }

  async runMigrations() {
    try {
      console.log('📋 Running database migrations...');
      
      const migrationsDir = path.join(__dirname, '../../src/database/migrations');
      
      if (!fs.existsSync(migrationsDir)) {
        console.log('⚠️  Migrations directory not found, skipping migrations');
        return;
      }

      // Get all migration files and sort them
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

      if (migrationFiles.length === 0) {
        console.log('⚠️  No migration files found');
        return;
      }

      // Create migrations tracking table
      await this.dbPool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(255) PRIMARY KEY,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      for (const file of migrationFiles) {
        const version = path.basename(file, '.sql');
        
        // Check if migration already executed
        const existsResult = await this.dbPool.query(
          'SELECT 1 FROM schema_migrations WHERE version = $1',
          [version]
        );

        if (existsResult.rows.length > 0) {
          console.log(`⏭️  Skipping migration: ${file} (already executed)`);
          continue;
        }

        console.log(`🔄 Running migration: ${file}`);
        
        const migrationPath = path.join(migrationsDir, file);
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        await this.dbPool.query('BEGIN');
        try {
          await this.dbPool.query(migrationSQL);
          await this.dbPool.query(
            'INSERT INTO schema_migrations (version) VALUES ($1)',
            [version]
          );
          await this.dbPool.query('COMMIT');
          console.log(`✅ Migration completed: ${file}`);
        } catch (error) {
          await this.dbPool.query('ROLLBACK');
          throw error;
        }
      }

      console.log('✅ All migrations completed successfully');
    } catch (error) {
      console.error('❌ Error running migrations:', error.message);
      throw error;
    }
  }

  async runSeeds() {
    try {
      console.log('🌱 Running database seeds...');
      
      const environment = process.env.NODE_ENV || 'development';
      const seedsDir = path.join(__dirname, `../../src/database/seeds/${environment}`);
      
      if (!fs.existsSync(seedsDir)) {
        console.log(`⚠️  Seeds directory not found for ${environment}, skipping seeds`);
        return;
      }

      const seedFiles = fs.readdirSync(seedsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

      if (seedFiles.length === 0) {
        console.log('⚠️  No seed files found');
        return;
      }

      for (const file of seedFiles) {
        console.log(`🌱 Running seed: ${file}`);
        
        const seedPath = path.join(seedsDir, file);
        const seedSQL = fs.readFileSync(seedPath, 'utf8');
        
        try {
          await this.dbPool.query(seedSQL);
          console.log(`✅ Seed completed: ${file}`);
        } catch (error) {
          console.warn(`⚠️  Warning in seed ${file}:`, error.message);
          // Continue with other seeds even if one fails
        }
      }

      console.log('✅ All seeds completed');
    } catch (error) {
      console.error('❌ Error running seeds:', error.message);
      throw error;
    }
  }

  async createIndexes() {
    try {
      console.log('📊 Creating database indexes...');
      
      const indexesDir = path.join(__dirname, '../../src/database/indexes');
      
      if (!fs.existsSync(indexesDir)) {
        console.log('⚠️  Indexes directory not found, skipping indexes');
        return;
      }

      const indexFiles = fs.readdirSync(indexesDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

      for (const file of indexFiles) {
        console.log(`📊 Creating indexes from: ${file}`);
        
        const indexPath = path.join(indexesDir, file);
        const indexSQL = fs.readFileSync(indexPath, 'utf8');
        
        try {
          await this.dbPool.query(indexSQL);
          console.log(`✅ Indexes created: ${file}`);
        } catch (error) {
          console.warn(`⚠️  Warning creating indexes from ${file}:`, error.message);
        }
      }

      console.log('✅ All indexes created');
    } catch (error) {
      console.error('❌ Error creating indexes:', error.message);
      throw error;
    }
  }

  async testConnection() {
    try {
      console.log('🔌 Testing database connection...');
      const result = await this.dbPool.query('SELECT NOW() as current_time, version() as pg_version');
      console.log('✅ Database connection successful');
      console.log(`📅 Current time: ${result.rows[0].current_time}`);
      console.log(`🐘 PostgreSQL version: ${result.rows[0].pg_version}`);
      
      // Test PostGIS
      const postgisResult = await this.dbPool.query('SELECT PostGIS_version() as postgis_version');
      console.log(`🌍 PostGIS version: ${postgisResult.rows[0].postgis_version}`);
      
    } catch (error) {
      console.error('❌ Database connection test failed:', error.message);
      throw error;
    }
  }

  async cleanup() {
    if (this.adminPool) {
      await this.adminPool.end();
    }
    if (this.dbPool) {
      await this.dbPool.end();
    }
  }
}

async function main() {
  const setup = new DatabaseSetup();
  
  try {
    console.log('🚀 Starting database setup...\n');
    
    // Step 1: Create database
    await setup.createDatabase();
    
    // Step 2: Enable extensions
    await setup.enableExtensions();
    
    // Step 3: Run migrations
    await setup.runMigrations();
    
    // Step 4: Create indexes
    await setup.createIndexes();
    
    // Step 5: Run seeds
    await setup.runSeeds();
    
    // Step 6: Test connection
    await setup.testConnection();
    
    console.log('\n🎉 Database setup completed successfully!');
    
  } catch (error) {
    console.error('\n💥 Database setup failed:', error.message);
    process.exit(1);
  } finally {
    await setup.cleanup();
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n⏹️  Setup interrupted');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏹️  Setup terminated');
  process.exit(0);
});

// Run the setup
if (require.main === module) {
  main();
}

module.exports = DatabaseSetup;
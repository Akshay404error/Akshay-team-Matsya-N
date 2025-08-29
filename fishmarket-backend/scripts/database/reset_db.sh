const { Pool } = require('pg');
const readline = require('readline');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'fishmarket_db'
};

// Admin config for database operations
const adminConfig = {
  ...dbConfig,
  database: 'postgres' // Connect to default postgres database
};

class DatabaseReset {
  constructor() {
    this.adminPool = new Pool(adminConfig);
    this.dbPool = null;
  }

  async confirmReset() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      const environment = process.env.NODE_ENV || 'development';
      const dbName = dbConfig.database;
      
      console.log('⚠️  WARNING: This will completely reset your database!');
      console.log(`📊 Environment: ${environment}`);
      console.log(`🗄️  Database: ${dbName}`);
      console.log('🗑️  All data will be permanently lost!');
      console.log('');
      
      rl.question('Are you sure you want to continue? (yes/no): ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
      });
    });
  }

  async dropDatabase() {
    try {
      console.log(`🗑️  Dropping database: ${dbConfig.database}`);
      
      // Terminate all connections to the database
      await this.adminPool.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [dbConfig.database]);

      // Drop the database
      await this.adminPool.query(`DROP DATABASE IF EXISTS "${dbConfig.database}"`);
      console.log('✅ Database dropped successfully');
      
    } catch (error) {
      console.error('❌ Error dropping database:', error.message);
      throw error;
    }
  }

  async createDatabase() {
    try {
      console.log(`📦 Creating database: ${dbConfig.database}`);
      await this.adminPool.query(`CREATE DATABASE "${dbConfig.database}"`);
      console.log('✅ Database created successfully');
      
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

      // Enable UUID extension
      await this.dbPool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      console.log('✅ UUID extension enabled');

      // Enable pg_trgm for text search
      await this.dbPool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      console.log('✅ pg_trgm extension enabled');

    } catch (error) {
      console.error('❌ Error enabling extensions:', error.message);
      throw error;
    }
  }

  async verifyReset() {
    try {
      console.log('🔍 Verifying database reset...');
      
      // Check if database exists and is empty
      const tablesResult = await this.dbPool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `);

      const tableCount = tablesResult.rows.length;
      console.log(`📊 Found ${tableCount} tables in the database`);

      // Check extensions
      const extensionsResult = await this.dbPool.query(`
        SELECT extname FROM pg_extension WHERE extname IN ('postgis', 'uuid-ossp', 'pg_trgm')
      `);

      console.log(`🔧 Extensions enabled: ${extensionsResult.rows.map(row => row.extname).join(', ')}`);

      // Test basic functionality
      const timeResult = await this.dbPool.query('SELECT NOW() as current_time');
      console.log(`⏰ Database time: ${timeResult.rows[0].current_time}`);

      console.log('✅ Database reset verification completed');

    } catch (error) {
      console.error('❌ Error verifying reset:', error.message);
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
  const reset = new DatabaseReset();
  
  try {
    // Skip confirmation if --force flag is provided
    const forceReset = process.argv.includes('--force') || process.argv.includes('-f');
    
    if (!forceReset) {
      const confirmed = await reset.confirmReset();
      if (!confirmed) {
        console.log('🚫 Database reset cancelled');
        return;
      }
    }

    console.log('\n🚀 Starting database reset...');
    
    // Step 1: Drop existing database
    await reset.dropDatabase();
    
    // Step 2: Create fresh database
    await reset.createDatabase();
    
    // Step 3: Enable extensions
    await reset.enableExtensions();
    
    // Step 4: Verify reset
    await reset.verifyReset();
    
    console.log('\n🎉 Database reset completed successfully!');
    console.log('💡 Next steps:');
    console.log('   1. Run migrations: npm run db:migrate');
    console.log('   2. Seed data: npm run db:seed');
    
  } catch (error) {
    console.error('\n💥 Database reset failed:', error.message);
    process.exit(1);
  } finally {
    await reset.cleanup();
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n⏹️  Reset interrupted');
  process.exit(0);
});

if (require.main === module) {
  main();
}

module.exports = DatabaseReset;
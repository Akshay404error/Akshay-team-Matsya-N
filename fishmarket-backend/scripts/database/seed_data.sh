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

class DatabaseSeeder {
  constructor() {
    this.pool = new Pool(dbConfig);
    this.environment = process.env.NODE_ENV || 'development';
  }

  async runSeedFile(filePath, filename) {
    console.log(`🌱 Running seed: ${filename}`);
    
    const seedSQL = fs.readFileSync(filePath, 'utf8');
    
    try {
      // Split SQL file by statements and execute them
      const statements = seedSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        if (statement.trim()) {
          await this.pool.query(statement);
        }
      }
      
      console.log(`✅ Seed completed: ${filename}`);
    } catch (error) {
      console.warn(`⚠️  Warning in seed ${filename}:`, error.message);
      // Continue with other seeds even if one fails
    }
  }

  async runSeeds() {
    try {
      console.log(`🌱 Starting database seeding for ${this.environment} environment...`);
      
      const seedsDir = path.join(__dirname, `../../src/database/seeds/${this.environment}`);
      
      if (!fs.existsSync(seedsDir)) {
        console.log(`⚠️  Seeds directory not found: ${seedsDir}`);
        console.log('📁 Available seed environments:');
        
        const parentSeedsDir = path.join(__dirname, '../../src/database/seeds');
        if (fs.existsSync(parentSeedsDir)) {
          const environments = fs.readdirSync(parentSeedsDir)
            .filter(item => fs.statSync(path.join(parentSeedsDir, item)).isDirectory());
          environments.forEach(env => console.log(`   - ${env}`));
        }
        return;
      }

      const seedFiles = fs.readdirSync(seedsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

      if (seedFiles.length === 0) {
        console.log(`⚠️  No seed files found in ${seedsDir}`);
        return;
      }

      console.log(`📦 Found ${seedFiles.length} seed file(s) for ${this.environment}`);

      for (const file of seedFiles) {
        const filePath = path.join(seedsDir, file);
        await this.runSeedFile(filePath, file);
      }

      console.log(`✅ All seed files completed for ${this.environment}`);
      
      // Show some basic stats
      await this.showStats();

    } catch (error) {
      console.error('❌ Error running seeds:', error.message);
      throw error;
    }
  }

  async showStats() {
    try {
      console.log('\n📊 Database Statistics:');
      
      // Get table counts (if tables exist)
      const commonTables = [
        'users', 'fisher_profiles', 'societies', 'catches', 
        'lots', 'auctions', 'bids', 'orders', 'riders', 
        'deliveries', 'payments'
      ];

      for (const tableName of commonTables) {
        try {
          const result = await this.pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
          const count = parseInt(result.rows[0].count);
          if (count > 0) {
            console.log(`   📋 ${tableName}: ${count} records`);
          }
        } catch (error) {
          // Table might not exist, skip silently
        }
      }

    } catch (error) {
      console.log('⚠️  Could not retrieve statistics');
    }
  }

  async testConnection() {
    try {
      const result = await this.pool.query('SELECT NOW() as current_time');
      console.log(`🔌 Database connection successful - ${result.rows[0].current_time}`);
      return true;
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      return false;
    }
  }

  async close() {
    await this.pool.end();
  }
}

async function main() {
  const seeder = new DatabaseSeeder();
  
  try {
    // Test connection first
    const connected = await seeder.testConnection();
    if (!connected) {
      process.exit(1);
    }

    await seeder.runSeeds();
    console.log('\n🎉 Database seeding completed successfully!');
    
  } catch (error) {
    console.error('\n💥 Database seeding failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await seeder.close();
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n⏹️  Seeding interrupted');
  process.exit(0);
});

if (require.main === module) {
  main();
}

module.exports = DatabaseSeeder;
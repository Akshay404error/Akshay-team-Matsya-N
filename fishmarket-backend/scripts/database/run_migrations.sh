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

class MigrationRunner {
  constructor() {
    this.pool = new Pool(dbConfig);
  }

  async createMigrationsTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.pool.query(query);
  }

  async getExecutedMigrations() {
    const result = await this.pool.query('SELECT version FROM schema_migrations ORDER BY version');
    return result.rows.map(row => row.version);
  }

  async executeMigration(filePath, version) {
    console.log(`🔄 Running migration: ${version}`);
    
    const migrationSQL = fs.readFileSync(filePath, 'utf8');
    
    await this.pool.query('BEGIN');
    try {
      await this.pool.query(migrationSQL);
      await this.pool.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [version]
      );
      await this.pool.query('COMMIT');
      console.log(`✅ Migration completed: ${version}`);
    } catch (error) {
      await this.pool.query('ROLLBACK');
      throw error;
    }
  }

  async runMigrations() {
    try {
      console.log('📋 Starting database migrations...');
      
      // Create migrations tracking table
      await this.createMigrationsTable();
      
      // Get migrations directory
      const migrationsDir = path.join(__dirname, '../../src/database/migrations');
      
      if (!fs.existsSync(migrationsDir)) {
        console.log('⚠️  Migrations directory not found');
        return;
      }

      // Get all migration files
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

      if (migrationFiles.length === 0) {
        console.log('⚠️  No migration files found');
        return;
      }

      // Get already executed migrations
      const executedMigrations = await this.getExecutedMigrations();
      
      // Run pending migrations
      let migrationsRun = 0;
      
      for (const file of migrationFiles) {
        const version = path.basename(file, '.sql');
        
        if (executedMigrations.includes(version)) {
          console.log(`⏭️  Skipping migration: ${file} (already executed)`);
          continue;
        }

        const filePath = path.join(migrationsDir, file);
        await this.executeMigration(filePath, version);
        migrationsRun++;
      }

      if (migrationsRun === 0) {
        console.log('✅ All migrations are up to date');
      } else {
        console.log(`✅ Successfully ran ${migrationsRun} migration(s)`);
      }

    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  }

  async close() {
    await this.pool.end();
  }
}

async function main() {
  const runner = new MigrationRunner();
  
  try {
    await runner.runMigrations();
    console.log('\n🎉 Migrations completed successfully!');
  } catch (error) {
    console.error('\n💥 Migration process failed:', error.message);
    process.exit(1);
  } finally {
    await runner.close();
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n⏹️  Migration interrupted');
  process.exit(0);
});

if (require.main === module) {
  main();
}

module.exports = MigrationRunner;
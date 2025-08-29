Fish Market Backend Setup & Run Guide
Quick Start Commands
1. Install Dependencies
bashnpm install
2. Environment Setup
bash# Copy environment template
cp .env.example .env.development

# Edit your environment variables
notepad .env.development  # Windows
# or
nano .env.development     # Linux/Mac
3. Database Setup (PostgreSQL + PostGIS)
Install PostgreSQL with PostGIS:

Windows: Download from postgresql.org
Ubuntu: sudo apt-get install postgresql postgresql-contrib postgis
Mac: brew install postgresql postgis

Create Database:
sql-- Connect to PostgreSQL as superuser
psql -U postgres

-- Create database and user
CREATE DATABASE fishmarket_dev;
CREATE USER fishmarket WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE fishmarket_dev TO fishmarket;

-- Connect to your database
\c fishmarket_dev

-- Enable PostGIS extension
CREATE EXTENSION postgis;
CREATE EXTENSION postgis_topology;
4. Redis Setup
Install Redis:

Windows: Download from redis.io or use WSL
Ubuntu: sudo apt-get install redis-server
Mac: brew install redis

Start Redis:
bashredis-server  # Default port 6379
5. Update Environment Variables
Edit your .env.development file:
env# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fishmarket_dev
DB_USER=fishmarket
DB_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your_super_secret_jwt_key_here
JWT_REFRESH_SECRET=your_refresh_token_secret_here
6. Run Database Migrations
bashnpm run db:migrate
7. Start Development Server
bashnpm run dev
Testing Your Setup
1. Health Check
bashcurl http://localhost:3000/health
2. Test OTP Flow
bash# Start OTP
curl -X POST http://localhost:3000/api/v1/auth/otp/start \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919999999999"}'

# Check logs for OTP code, then verify
curl -X POST http://localhost:3000/api/v1/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919999999999", "otp": "123456"}'
Week 1-2 Development Tasks ✅
Core Infrastructure (Your Role):

 Database Setup: PostgreSQL + PostGIS configuration
 User Model: Complete user management with roles
 Catch Model: Fisher catch logging with GPS support
 Authentication: OTP-based auth with JWT tokens
 Redis Integration: Caching and session management
 API Structure: RESTful endpoints with validation
 Error Handling: Comprehensive error middleware
 Logging: Winston logger setup

Next Week Tasks:

Fisher Catch API: Complete catch logging endpoints
Geospatial Queries: PostGIS-based location searches
Media Upload: S3 integration for catch images
Basic Catalog: Public marketplace browsing
Testing: Unit tests for models and APIs

API Endpoints Created
Authentication (/api/v1/auth/)

POST /otp/start - Send OTP
POST /otp/verify - Verify OTP & login
POST /refresh - Refresh access token
GET /profile - Get user profile
PUT /profile - Update profile

Health & Status

GET /health - System health check
GET / - API documentation

Database Schema
Tables Created:

users - Main user table with roles
catches - Fisher catch logs with PostGIS geometry
audit_logs - System audit trail

PostGIS Functions:

get_catches_within_radius() - Find catches by location
calculate_freshness_score() - Fish freshness calculation
expire_old_catches() - Auto-expire old catches

Project Structure
src/
├── config/          # Database & Redis config
├── models/          # Data models (User, Catch)
├── controllers/     # Request handlers
├── routes/          # API routes
├── middleware/      # Validation, auth, errors
├── utils/           # Helpers and validation
└── database/        # Migrations and queries
Development Tips

Check logs: tail -f logs/app.log
PostgreSQL logs: Check your PostgreSQL data directory
Redis monitoring: redis-cli monitor
API testing: Use Postman or curl
Database queries: Use pgAdmin or psql client

Integration Points
Your backend will integrate with:

Roshini's Auction System: WebSocket auction APIs
Roshini's Fisher App: Mobile catch upload APIs
Roshini's Marketplace: Public catalog APIs
Akshay's Delivery: Payment and delivery APIs

Production Checklist
Before deployment:

 Change default JWT secrets
 Remove development OTP logging
 Set up SSL certificates
 Configure production database
 Set up monitoring (Grafana/Prometheus)
 Configure backups
 Set up CI/CD pipeline


🐟 Your backend foundation is ready! Start with the database setup and then test the OTP authentication flow.
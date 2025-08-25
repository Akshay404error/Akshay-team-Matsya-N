@echo off
REM Backend & Database Folder Structure Setup
REM Run this in Command Prompt as Administrator (for npm global packages)

echo Creating fishmarket-backend project structure...

REM Create root directory and navigate
mkdir fishmarket-backend
cd fishmarket-backend

REM Create main source directories
mkdir src
mkdir src\config
mkdir src\models
mkdir src\controllers
mkdir src\routes
mkdir src\middleware
mkdir src\services
mkdir src\utils
mkdir src\database

REM Create config files structure
cd src\config
echo. > database.js
echo. > redis.js
echo. > environment.js
echo. > index.js
cd ..\..

REM Create models structure
cd src\models
echo. > User.js
echo. > FisherProfile.js
echo. > Society.js
echo. > Catch.js
echo. > Lot.js
echo. > Auction.js
echo. > Bid.js
echo. > Order.js
echo. > Rider.js
echo. > Delivery.js
echo. > Payment.js
echo. > AuditLog.js
echo. > index.js
cd ..\..

REM Create controllers structure
cd src\controllers
mkdir auth
mkdir fisher
mkdir society
mkdir marketplace
mkdir delivery
mkdir admin

cd auth
echo. > authController.js
echo. > kycController.js
cd ..

cd fisher
echo. > catchController.js
echo. > lotController.js
echo. > payoutController.js
cd ..

cd society
echo. > intakeController.js
echo. > qcController.js
echo. > auctionController.js
cd ..

cd marketplace
echo. > catalogController.js
echo. > cartController.js
echo. > orderController.js
cd ..

cd delivery
echo. > riderController.js
echo. > deliveryController.js
cd ..

cd admin
echo. > analyticsController.js
echo. > complianceController.js
cd ..

cd ..\..

REM Create routes structure
cd src\routes
echo. > auth.js
echo. > fisher.js
echo. > society.js
echo. > marketplace.js
echo. > delivery.js
echo. > admin.js
echo. > index.js
cd ..\..

REM Create middleware structure
cd src\middleware
echo. > auth.js
echo. > rbac.js
echo. > validation.js
echo. > rateLimit.js
echo. > logger.js
echo. > errorHandler.js
echo. > geoMiddleware.js
cd ..\..

REM Create services structure
cd src\services
mkdir auth
mkdir geo
mkdir cache
mkdir queue
mkdir storage
mkdir notification
mkdir audit

cd auth
echo. > otpService.js
echo. > jwtService.js
echo. > kycService.js
cd ..

cd geo
echo. > geoService.js
echo. > geofenceService.js
echo. > mapService.js
cd ..

cd cache
echo. > redisService.js
echo. > cacheKeys.js
cd ..

cd queue
echo. > queueService.js
echo. > jobProcessors.js
cd ..

cd storage
echo. > s3Service.js
echo. > mediaService.js
cd ..

cd notification
echo. > smsService.js
echo. > emailService.js
cd ..

cd audit
echo. > auditService.js
cd ..

cd ..\..

REM Create utils structure
cd src\utils
mkdir validation
mkdir helpers
mkdir crypto

cd validation
mkdir schemas
cd schemas
echo. > userSchema.js
echo. > catchSchema.js
echo. > lotSchema.js
echo. > auctionSchema.js
echo. > orderSchema.js
cd ..
echo. > validator.js
cd ..

cd helpers
echo. > dateHelpers.js
echo. > formatters.js
echo. > calculations.js
echo. > constants.js
cd ..

cd crypto
echo. > encryption.js
echo. > hashing.js
cd ..

echo. > logger.js
cd ..\..

REM Create database structure
cd src\database
mkdir migrations
mkdir seeds
mkdir queries
mkdir indexes

echo. > connection.js

cd migrations
echo. > 001_create_users_table.sql
echo. > 002_create_fisher_profiles_table.sql
echo. > 003_create_societies_table.sql
echo. > 004_create_catches_table.sql
echo. > 005_create_lots_table.sql
echo. > 006_create_auctions_table.sql
echo. > 007_create_bids_table.sql
echo. > 008_create_orders_table.sql
echo. > 009_create_riders_table.sql
echo. > 010_create_deliveries_table.sql
echo. > 011_create_payments_table.sql
echo. > 012_create_audit_logs_table.sql
echo. > 013_create_postgis_extensions.sql
cd ..

cd seeds
mkdir development
mkdir production
cd development
echo. > users.sql
echo. > societies.sql
echo. > sample_data.sql
cd ..
cd production
echo. > initial_data.sql
cd ..
cd ..

cd queries
mkdir geo
mkdir analytics
mkdir compliance
cd geo
echo. > spatial_queries.sql
echo. > geofence_queries.sql
cd ..
cd analytics
echo. > catch_analytics.sql
echo. > auction_analytics.sql
cd ..
cd compliance
echo. > quota_queries.sql
cd ..
cd ..

cd indexes
echo. > spatial_indexes.sql
echo. > performance_indexes.sql
echo. > composite_indexes.sql
cd ..

cd ..\..

REM Create main app file
echo. > src\app.js

REM Create tests structure
mkdir tests
cd tests
mkdir unit
mkdir integration
mkdir fixtures
mkdir setup

cd unit
mkdir models
mkdir controllers
mkdir services
mkdir utils
cd ..

cd integration
mkdir auth
mkdir fisher
mkdir society
mkdir marketplace
mkdir delivery
cd ..

cd fixtures
echo. > users.json
echo. > catches.json
mkdir sample_images
cd ..

cd setup
echo. > testDb.js
echo. > testHelpers.js
cd ..

cd ..

REM Create docs structure
mkdir docs
cd docs
mkdir api
mkdir database
mkdir deployment

cd api
echo. > swagger.yaml
echo. > endpoints.md
echo. > postman_collection.json
cd ..

cd database
echo. > schema.md
echo. > er_diagram.png
echo. > migration_guide.md
cd ..

cd deployment
echo. > setup.md
echo. > environment_variables.md
cd ..

echo. > README.md
cd ..

REM Create scripts structure
mkdir scripts
cd scripts
mkdir database
mkdir deployment
mkdir development

cd database
echo. > setup_db.sh
echo. > run_migrations.sh
echo. > backup_db.sh
echo. > reset_db.sh
cd ..

cd deployment
echo. > build.sh
echo. > deploy.sh
cd ..

cd development
echo. > seed_data.sh
echo. > test_data_generator.js
cd ..

cd ..

REM Create docker structure
mkdir docker
cd docker
mkdir nginx
echo. > Dockerfile
echo. > Dockerfile.dev
echo. > docker-compose.yml
echo. > docker-compose.dev.yml
cd nginx
echo. > nginx.conf
cd ..
cd ..

REM Create root config files
echo. > .env.example
echo. > .env.development
echo. > .env.testing
REM Don't create package.json here - let npm init create it
echo. > .gitignore
echo. > eslint.config.js
echo. > jest.config.js
echo. > README.md

REM Initialize npm project FIRST (this creates package.json)
echo Initializing npm project...
npm init -y

REM Install main dependencies
echo Installing main dependencies...
npm install express pg redis jsonwebtoken bcryptjs joi multer aws-sdk socket.io helmet cors express-rate-limit winston dotenv uuid

REM Install development dependencies
echo Installing development dependencies...
npm install --save-dev jest supertest eslint nodemon

REM Create .gitignore content properly
(
echo node_modules/
echo .env
echo .env.local
echo .env.production
echo logs/
echo *.log
echo dist/
echo build/
echo coverage/
echo .nyc_output/
echo .DS_Store
echo Thumbs.db
) > .gitignore

echo.
echo ===============================================
echo Backend folder structure created successfully!
echo ===============================================
echo.
echo Next steps:
echo 1. Install PostgreSQL with PostGIS extension
echo 2. Install Redis server
echo 3. Configure your .env files
echo 4. Start coding your models and APIs
echo.
echo Project location: %CD%
echo.

REM Show directory tree
echo Directory structure:
tree /F

pause
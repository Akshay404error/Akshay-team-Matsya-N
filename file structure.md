# File Tree: Backend & Database (Postgres + PostGIS) (AKSHAY TEAM) v.0.0.1

Generated on: 8/26/2025, 11:12:34 AM
Root path: `d:\Backend & Database (Postgres + PostGIS) (AKSHAY TEAM) v.0.0.1`

```
├── 📁 fishmarket-backend/
│   ├── 📁 docker/
│   │   ├── 📁 nginx/
│   │   │   └── ⚙️ nginx.conf
│   │   ├── 🐳 Dockerfile
│   │   ├── 📄 Dockerfile.dev
│   │   ├── ⚙️ docker-compose.dev.yml
│   │   └── ⚙️ docker-compose.yml
│   ├── 📁 docs/
│   │   ├── 📁 api/
│   │   │   ├── 📝 endpoints.md
│   │   │   ├── 📄 postman_collection.json
│   │   │   └── ⚙️ swagger.yaml
│   │   ├── 📁 database/
│   │   │   ├── 🖼️ er_diagram.png
│   │   │   ├── 📝 migration_guide.md
│   │   │   └── 📝 schema.md
│   │   ├── 📁 deployment/
│   │   │   ├── 📝 environment_variables.md
│   │   │   └── 📝 setup.md
│   │   └── 📖 README.md
│   ├── 📁 node_modules/ 🚫 (auto-hidden)
│   ├── 📁 projects/
│   │   └── 📁 fishmarket/
│   ├── 📁 scripts/
│   │   ├── 📁 database/
│   │   │   ├── 🐚 backup_db.sh
│   │   │   ├── 🐚 reset_db.sh
│   │   │   ├── 🐚 run_migrations.sh
│   │   │   └── 🐚 setup_db.sh
│   │   ├── 📁 deployment/
│   │   │   ├── 🐚 build.sh
│   │   │   └── 🐚 deploy.sh
│   │   └── 📁 development/
│   │       ├── 🐚 seed_data.sh
│   │       └── 📄 test_data_generator.js
│   ├── 📁 src/
│   │   ├── 📁 config/
│   │   │   ├── 📄 database.js
│   │   │   ├── 📄 environment.js
│   │   │   ├── 📄 index.js
│   │   │   └── 📄 redis.js
│   │   ├── 📁 controllers/
│   │   │   ├── 📁 admin/
│   │   │   │   ├── 📄 analyticsController.js
│   │   │   │   └── 📄 complianceController.js
│   │   │   ├── 📁 auth/
│   │   │   │   ├── 📄 authController.js
│   │   │   │   └── 📄 kycController.js
│   │   │   ├── 📁 delivery/
│   │   │   │   ├── 📄 deliveryController.js
│   │   │   │   └── 📄 riderController.js
│   │   │   ├── 📁 fisher/
│   │   │   │   ├── 📄 catchController.js
│   │   │   │   ├── 📄 lotController.js
│   │   │   │   └── 📄 payoutController.js
│   │   │   ├── 📁 marketplace/
│   │   │   │   ├── 📄 cartController.js
│   │   │   │   ├── 📄 catalogController.js
│   │   │   │   └── 📄 orderController.js
│   │   │   └── 📁 society/
│   │   │       ├── 📄 auctionController.js
│   │   │       ├── 📄 intakeController.js
│   │   │       └── 📄 qcController.js
│   │   ├── 📁 database/
│   │   │   ├── 📁 indexes/
│   │   │   │   ├── 🗄️ composite_indexes.sql
│   │   │   │   ├── 🗄️ performance_indexes.sql
│   │   │   │   └── 🗄️ spatial_indexes.sql
│   │   │   ├── 📁 migrations/
│   │   │   │   ├── 🗄️ 001_create_users_table.sql
│   │   │   │   ├── 🗄️ 002_create_fisher_profiles_table.sql
│   │   │   │   ├── 🗄️ 003_create_societies_table.sql
│   │   │   │   ├── 🗄️ 004_create_catches_table.sql
│   │   │   │   ├── 🗄️ 005_create_lots_table.sql
│   │   │   │   ├── 🗄️ 006_create_auctions_table.sql
│   │   │   │   ├── 🗄️ 007_create_bids_table.sql
│   │   │   │   ├── 🗄️ 008_create_orders_table.sql
│   │   │   │   ├── 🗄️ 009_create_riders_table.sql
│   │   │   │   ├── 🗄️ 010_create_deliveries_table.sql
│   │   │   │   ├── 🗄️ 011_create_payments_table.sql
│   │   │   │   ├── 🗄️ 012_create_audit_logs_table.sql
│   │   │   │   └── 🗄️ 013_create_postgis_extensions.sql
│   │   │   ├── 📁 queries/
│   │   │   │   ├── 📁 analytics/
│   │   │   │   │   ├── 🗄️ auction_analytics.sql
│   │   │   │   │   └── 🗄️ catch_analytics.sql
│   │   │   │   ├── 📁 compliance/
│   │   │   │   │   └── 🗄️ quota_queries.sql
│   │   │   │   └── 📁 geo/
│   │   │   │       ├── 🗄️ geofence_queries.sql
│   │   │   │       └── 🗄️ spatial_queries.sql
│   │   │   ├── 📁 seeds/
│   │   │   │   ├── 📁 development/
│   │   │   │   │   ├── 🗄️ sample_data.sql
│   │   │   │   │   ├── 🗄️ societies.sql
│   │   │   │   │   └── 🗄️ users.sql
│   │   │   │   └── 📁 production/
│   │   │   │       └── 🗄️ initial_data.sql
│   │   │   └── 📄 connection.js
│   │   ├── 📁 middleware/
│   │   │   ├── 📄 auth.js
│   │   │   ├── 📄 errorHandler.js
│   │   │   ├── 📄 geoMiddleware.js
│   │   │   ├── 📄 logger.js
│   │   │   ├── 📄 rateLimit.js
│   │   │   ├── 📄 rbac.js
│   │   │   └── 📄 validation.js
│   │   ├── 📁 models/
│   │   │   ├── 📄 Auction.js
│   │   │   ├── 📄 AuditLog.js
│   │   │   ├── 📄 Bid.js
│   │   │   ├── 📄 Catch.js
│   │   │   ├── 📄 Delivery.js
│   │   │   ├── 📄 FisherProfile.js
│   │   │   ├── 📄 Lot.js
│   │   │   ├── 📄 Order.js
│   │   │   ├── 📄 Payment.js
│   │   │   ├── 📄 Rider.js
│   │   │   ├── 📄 Society.js
│   │   │   ├── 📄 User.js
│   │   │   └── 📄 index.js
│   │   ├── 📁 routes/
│   │   │   ├── 📄 admin.js
│   │   │   ├── 📄 auth.js
│   │   │   ├── 📄 delivery.js
│   │   │   ├── 📄 fisher.js
│   │   │   ├── 📄 index.js
│   │   │   ├── 📄 marketplace.js
│   │   │   └── 📄 society.js
│   │   ├── 📁 services/
│   │   │   ├── 📁 audit/
│   │   │   │   └── 📄 auditService.js
│   │   │   ├── 📁 auth/
│   │   │   │   ├── 📄 jwtService.js
│   │   │   │   ├── 📄 kycService.js
│   │   │   │   └── 📄 otpService.js
│   │   │   ├── 📁 cache/ 🚫 (auto-hidden)
│   │   │   ├── 📁 geo/
│   │   │   │   ├── 📄 geoService.js
│   │   │   │   ├── 📄 geofenceService.js
│   │   │   │   └── 📄 mapService.js
│   │   │   ├── 📁 notification/
│   │   │   │   ├── 📄 emailService.js
│   │   │   │   └── 📄 smsService.js
│   │   │   ├── 📁 queue/
│   │   │   │   ├── 📄 jobProcessors.js
│   │   │   │   └── 📄 queueService.js
│   │   │   └── 📁 storage/
│   │   │       ├── 📄 mediaService.js
│   │   │       └── 📄 s3Service.js
│   │   ├── 📁 utils/
│   │   │   ├── 📁 crypto/
│   │   │   │   ├── 📄 encryption.js
│   │   │   │   └── 📄 hashing.js
│   │   │   ├── 📁 helpers/
│   │   │   │   ├── 📄 calculations.js
│   │   │   │   ├── 📄 constants.js
│   │   │   │   ├── 📄 dateHelpers.js
│   │   │   │   └── 📄 formatters.js
│   │   │   ├── 📁 validation/
│   │   │   │   ├── 📁 schemas/
│   │   │   │   │   ├── 📄 auctionSchema.js
│   │   │   │   │   ├── 📄 catchSchema.js
│   │   │   │   │   ├── 📄 lotSchema.js
│   │   │   │   │   ├── 📄 orderSchema.js
│   │   │   │   │   └── 📄 userSchema.js
│   │   │   │   └── 📄 validator.js
│   │   │   └── 📄 logger.js
│   │   └── 📄 app.js
│   ├── 📁 tests/
│   │   ├── 📁 fixtures/
│   │   │   ├── 📁 sample_images/
│   │   │   ├── 📄 catches.json
│   │   │   └── 📄 users.json
│   │   ├── 📁 integration/
│   │   │   ├── 📁 auth/
│   │   │   ├── 📁 delivery/
│   │   │   ├── 📁 fisher/
│   │   │   ├── 📁 marketplace/
│   │   │   └── 📁 society/
│   │   ├── 📁 setup/
│   │   │   ├── 📄 testDb.js
│   │   │   └── 📄 testHelpers.js
│   │   └── 📁 unit/
│   │       ├── 📁 controllers/
│   │       ├── 📁 models/
│   │       ├── 📁 services/
│   │       └── 📁 utils/
│   ├── 📄 .env.development 🚫 (auto-hidden)
│   ├── 📄 .env.example
│   ├── 📄 .env.testing
│   ├── 🚫 .gitignore
│   ├── 📖 README.md
│   ├── 📄 eslint.config.js
│   ├── 📄 jest.config.js
│   ├── 📄 package-lock.json
│   └── 📄 package.json
├── 🐚 setup-backend.bat
└── 📄 structure.txt
```

---
*Generated by FileTree Pro Extension*
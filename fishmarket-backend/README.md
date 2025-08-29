# Fish Market Auction Platform Backend

A comprehensive backend API for a real-time fish market auction platform built with Node.js, PostgreSQL + PostGIS, Redis, and Socket.io.

## 🚀 Features

- **User Authentication & Authorization** (JWT-based)
- **Real-time Auction System** with Socket.io
- **Geospatial Features** using PostGIS
- **Image Upload & Processing** with Sharp
- **Redis Caching** for performance
- **Rate Limiting & Security** with Helmet, CORS
- **Comprehensive Logging** with Winston
- **RESTful APIs** with Express.js
- **Real-time Notifications**

## 🛠️ Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **PostgreSQL** - Primary database
- **PostGIS** - Geospatial extension for PostgreSQL
- **Redis** - Caching and session management
- **Socket.io** - Real-time communication
- **JWT** - Authentication
- **Sharp** - Image processing
- **Winston** - Logging
- **Multer** - File uploads

## 📋 Prerequisites

Before running this application, make sure you have the following installed:

- **Node.js** (v18 or higher)
- **PostgreSQL** (v13 or higher) with PostGIS extension
- **Redis** (v6 or higher)
- **npm** or **yarn**

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd fishmarket-backend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables
```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your configuration
nano .env
```

### 4. Configure your `.env` file:
```env
# Server Configuration
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:3000

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/fishmarket_db

# Redis Configuration
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d
```

### 5. Set up PostgreSQL database

#### Create the database:
```sql
-- Connect to PostgreSQL as superuser
CREATE DATABASE fishmarket_db;
CREATE USER fishmarket_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE fishmarket_db TO fishmarket_user;

-- Connect to fishmarket_db
\c fishmarket_db;
CREATE EXTENSION postgis;
CREATE EXTENSION "uuid-ossp";
```

### 6. Initialize the database
```bash
npm run db:setup
```

### 7. Start Redis server
```bash
# On Ubuntu/Debian
sudo systemctl start redis-server

# On macOS with Homebrew
brew services start redis

# Or run directly
redis-server
```

### 8. Start the development server
```bash
npm run dev
```

The server will start on `http://localhost:3000`

## 📁 Project Structure

```
├── src/
│   ├── app.js                 # Main application file
│   ├── config/
│   │   ├── database.js        # Database configuration
│   │   ├── redis.js          # Redis configuration
│   │   └── logger.js         # Winston logger setup
│   ├── middleware/
│   │   ├── auth.js           # Authentication middleware
│   │   └── errorHandler.js   # Error handling middleware
│   ├── routes/
│   │   ├── auth.js           # Authentication routes
│   │   ├── fish.js           # Fish listing routes
│   │   ├── markets.js        # Market routes
│   │   ├── auctions.js       # Auction routes
│   │   └── bids.js           # Bidding routes
│   ├── services/
│   │   └── socketHandler.js  # Socket.io real-time handling
│   └── utils/
├── scripts/
│   └── database/
│       ├── setup.js          # Database setup script
│       └── schema.sql        # Database schema
├── logs/                     # Application logs
├── .env.example             # Environment variables template
└── package.json
```

## 🔧 Available Scripts

```bash
# Development
npm run dev              # Start development server with nodemon
npm start               # Start production server

# Database
npm run db:setup        # Set up database schema and sample data
npm run db:migrate      # Run database migrations
npm run db:seed         # Seed database with sample data
npm run db:reset        # Reset database

# Testing
npm test               # Run tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage

# Code Quality
npm run lint          # Run ESLint
npm run lint:fix      # Fix ESLint issues

# Utilities
npm run logs:clear    # Clear log files
npm run install:all   # Install dependencies and set up database
```

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication. Here's how to use it:

### 1. Register a new user
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "role": "fisherman", // or "buyer", "admin"
  "phone": "+1234567890"
}
```

### 2. Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### 3. Use the token in subsequent requests
```bash
Authorization: Bearer <your_jwt_token>
```

## 🎣 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile
- `POST /api/auth/change-password` - Change password

### Fish Listings
- `GET /api/fish` - Get all fish listings (with filters)
- `GET /api/fish/:id` - Get specific fish listing
- `POST /api/fish` - Create fish listing (fisherman only)
- `PUT /api/fish/:id` - Update fish listing (owner only)
- `DELETE /api/fish/:id` - Delete fish listing (owner only)

### Markets
- `GET /api/markets` - Get all markets
- `GET /api/markets/:id` - Get specific market
- `GET /api/markets/nearby` - Find nearby markets

### Auctions
- `GET /api/auctions` - Get all auctions
- `GET /api/auctions/:id` - Get specific auction
- `POST /api/auctions` - Create auction (fisherman only)
- `PUT /api/auctions/:id` - Update auction (owner only)

### Bids
- `GET /api/bids/my-bids` - Get user's bids
- `POST /api/bids` - Place a bid
- `GET /api/auctions/:id/bids` - Get auction bids

## 🔄 Real-time Features

The application uses Socket.io for real-time features:

### Connecting to Socket.io
```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your_jwt_token'
  }
});
```

### Available Socket Events

#### Client to Server:
- `join-auction` - Join an auction room
- `leave-auction` - Leave an auction room
- `place-bid` - Place a bid in real-time
- `watch-auction` - Watch an auction for notifications
- `unwatch-auction` - Stop watching an auction

#### Server to Client:
- `connected` - Connection confirmation
- `auction-joined` - Successfully joined auction
- `new-bid` - New bid placed in auction
- `bid-placed` - Your bid was placed successfully
- `bid-error` - Bid placement failed
- `outbid-notification` - You've been outbid
- `auction-ended` - Auction has ended

## 🌍 Geospatial Features

The application uses PostGIS for location-based features:

### Find nearby markets
```bash
GET /api/markets/nearby?lat=12.9716&lng=77.5946&radius=10
```

### Fish listings with location filtering
```bash
GET /api/fish?lat=12.9716&lng=77.5946&radius=50
```

## 📊 Sample Data

The database setup includes sample data:
- **Admin user**: `admin@fishmarket.com` / `password123`
- **Fisherman**: `fisherman1@example.com` / `password123`
- **Buyer**: `buyer1@example.com` / `password123`
- **Markets**: Mumbai, Kochi, and Chennai fish markets

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_EXPIRE` | JWT expiration time | `7d` |
| `CLIENT_URL` | Frontend URL for CORS | `http://localhost:3000` |

## 📝 Logging

Logs are stored in the `logs/` directory:
- `error.log` - Error logs only
- `combined.log` - All logs
- `exceptions.log` - Uncaught exceptions
- `rejections.log` - Unhandled promise rejections

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 🚀 Production Deployment

### 1. Set production environment variables
```env
NODE_ENV=production
DATABASE_URL=your_production_db_url
REDIS_URL=your_production_redis_url
JWT_SECRET=your_strong_production_secret
```

### 2. Use PM2 for process management
```bash
npm install -g pm2
pm2 start src/app.js --name fishmarket-api
pm2 startup
pm2 save
```

### 3. Set up reverse proxy (Nginx)
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Troubleshooting

### Common Issues

1. **Database connection error**
   - Check PostgreSQL is running
   - Verify DATABASE_URL in .env
   - Ensure PostGIS extension is installed

2. **Redis connection error**
   - Check Redis is running: `redis-cli ping`
   - Verify REDIS_URL in .env

3. **Permission errors**
   - Check database user permissions
   - Verify file system permissions for uploads

4. **Port already in use**
   - Change PORT in .env
   - Kill process using port: `lsof -ti:3000 | xargs kill -9`

### Getting Help

- Create an issue on GitHub
- Check the logs in `logs/` directory
- Enable debug logging: `LOG_LEVEL=debug npm run dev`

---

**Happy Coding! 🐟**
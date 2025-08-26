require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Import configurations and utilities
const logger = require('./utils/logger');
const { testConnection } = require('./config/database');
const { initializeRedis } = require('./config/redis');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const fisherRoutes = require('./routes/fisher');
const societyRoutes = require('./routes/society');
const marketplaceRoutes = require('./routes/marketplace');
const deliveryRoutes = require('./routes/delivery');
const adminRoutes = require('./routes/admin');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = process.env.API_VERSION || 'v1';

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  }
});
app.use(limiter);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  });
  
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbStatus = await testConnection();
    
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: dbStatus ? 'connected' : 'disconnected',
        redis: 'connected' // TODO: Add Redis health check
      }
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: 'Service unavailable'
    });
  }
});

// API documentation endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Fish Market Backend API',
    version: API_VERSION,
    documentation: '/docs',
    health: '/health',
    endpoints: {
      auth: `/api/${API_VERSION}/auth`,
      fisher: `/api/${API_VERSION}/fisher`,
      society: `/api/${API_VERSION}/society`,
      marketplace: `/api/${API_VERSION}/marketplace`,
      delivery: `/api/${API_VERSION}/delivery`,
      admin: `/api/${API_VERSION}/admin`
    }
  });
});

// API Routes
const apiRouter = express.Router();

// Public routes (no auth required)
apiRouter.use('/auth', authRoutes);
apiRouter.use('/marketplace', marketplaceRoutes); // Browse catalog without auth

// Protected routes (auth required)
apiRouter.use('/fisher', authMiddleware, fisherRoutes);
apiRouter.use('/society', authMiddleware, societyRoutes);
apiRouter.use('/delivery', authMiddleware, deliveryRoutes);
apiRouter.use('/admin', authMiddleware, adminRoutes);

// Mount API routes
app.use(`/api/${API_VERSION}`, apiRouter);

// 404 handler for unknown routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: [
      '/health',
      '/api/v1/auth',
      '/api/v1/fisher',
      '/api/v1/society',
      '/api/v1/marketplace',
      '/api/v1/delivery',
      '/api/v1/admin'
    ]
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// Initialize services and start server
const startServer = async () => {
  try {
    logger.info('Initializing Fish Market Backend API...');

    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    // Initialize Redis
    const redisConnected = await initializeRedis();
    if (!redisConnected) {
      logger.warn('Redis connection failed - some features may not work properly');
    }

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`🐟 Fish Market API started successfully!`);
      logger.info(`📡 Server running on port ${PORT}`);
      logger.info(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📚 API Documentation: http://localhost:${PORT}`);
      logger.info(`💊 Health Check: http://localhost:${PORT}/health`);
      logger.info(`🔗 Base API URL: http://localhost:${PORT}/api/${API_VERSION}`);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      server.close(() => {
        logger.info('HTTP server closed');
        
        // Close database and Redis connections
        require('./config/database').closePool();
        require('./config/redis').closeRedis();
        
        process.exit(0);
      });

      // Force close after 30 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception:', err);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED_REJECTION');
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;
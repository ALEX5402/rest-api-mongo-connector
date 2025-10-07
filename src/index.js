const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./database/connection');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter, paymentLimiter, userCreationLimiter } = require('./middleware/rateLimiter');
const { authenticateApiKey, optionalApiKeyAuth, generateApiKey } = require('./middleware/auth');

// Import routes
const universalRoutes = require('./routes/universal');
const schemaRoutes = require('./routes/schemas');
const collectionRoutes = require('./routes/collections');
const databaseRoutes = require('./routes/database');

// Connect to MongoDB
connectDB();

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-android-app-domain.com'] // Replace with your Android app's domain
    : ['http://localhost:3000', 'http://localhost:8080', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use('/api', apiLimiter);

// Health check endpoint (public)
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Payment API is running',
    timestamp: new Date().toISOString(),
    environment: config.server.env
  });
});

// API key generation endpoint (for development/testing)
app.get('/generate-api-key', (req, res) => {
  const newApiKey = generateApiKey();
  res.json({
    success: true,
    message: 'New API key generated',
    apiKey: newApiKey,
    note: 'Add this to your .env file as API_KEY=your-key-here'
  });
});

// Complete MongoDB Database System API routes (protected with API key authentication)
app.use(`/api/${config.api.version}/database`, authenticateApiKey, apiLimiter, databaseRoutes);
app.use(`/api/${config.api.version}/schemas`, authenticateApiKey, apiLimiter, schemaRoutes);
app.use(`/api/${config.api.version}/collections`, authenticateApiKey, apiLimiter, collectionRoutes);
app.use(`/api/${config.api.version}`, authenticateApiKey, apiLimiter, universalRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Payment API MongoDB Connector',
    version: config.api.version,
    authentication: {
      required: true,
      method: 'API Key',
      header: 'X-API-Key or Authorization: Bearer <api-key>',
      generateKey: '/generate-api-key'
    },
    endpoints: {
      health: '/health',
      generateApiKey: '/generate-api-key',
      database: `/api/${config.api.version}/database`,
      schemas: `/api/${config.api.version}/schemas`,
      collections: `/api/${config.api.version}/collections`,
      universal: `/api/${config.api.version}`
    },
    documentation: {
      database: {
        'GET /info': 'Get complete database information and stats',
        'GET /collections': 'List all collections with detailed info',
        'POST /collections': 'Create new collection',
        'DELETE /collections/:name': 'Drop collection',
        'POST /collections/:name/indexes': 'Create index on collection',
        'DELETE /collections/:name/indexes/:indexName': 'Drop index',
        'POST /query': 'Execute raw MongoDB queries',
        'POST /backup': 'Create database backup',
        'POST /restore': 'Restore database from backup'
      },
      schemas: {
        'GET /': 'List all database schemas',
        'GET /:id': 'Get schema by ID',
        'GET /collection/:collectionName': 'Get schema by collection name',
        'POST /': 'Create new schema',
        'PUT /:id': 'Update schema',
        'DELETE /:id': 'Delete schema',
        'GET /:id/collections': 'Get collections created from schema',
        'POST /:id/validate': 'Validate data against schema',
        'GET /export/:id': 'Export schema as JSON'
      },
      collections: {
        'GET /': 'List all collections with schema info',
        'GET /:collectionName': 'Get collection details and analysis',
        'GET /:collectionName/documents': 'Get documents from collection',
        'POST /:collectionName/documents': 'Create new document',
        'PUT /:collectionName/documents/:id': 'Update document',
        'DELETE /:collectionName/documents/:id': 'Delete document',
        'POST /:collectionName/analyze': 'Analyze collection structure'
      },
      universal: {
        'GET /collections': 'List all collections in the database',
        'GET /:collection': 'Get all documents from a collection with filtering and pagination',
        'GET /:collection/:id': 'Get document by ID',
        'POST /:collection': 'Create new document',
        'PUT /:collection/:id': 'Update document (full replace)',
        'PATCH /:collection/:id': 'Update document (partial update)',
        'DELETE /:collection/:id': 'Delete document',
        'POST /:collection/bulk': 'Bulk operations (insert, update, delete)',
        'GET /:collection/stats': 'Get collection statistics'
      },
      queryExamples: {
        filtering: '?name=John&age>25&status=active',
        sorting: '?sort=name,-createdAt',
        pagination: '?page=1&limit=10',
        fields: '?fields=name,email,createdAt',
        regex: '?name~john (case-insensitive search)',
        arrays: '?tags=tag1,tag2,tag3',
        comparison: '?price>100&price<=500'
      }
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

const PORT = config.server.port;

app.listen(PORT, () => {
  console.log(`🚀 Payment API Server running on port ${PORT}`);
  console.log(`📊 Environment: ${config.server.env}`);
  console.log(`📖 API Documentation: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

module.exports = app;

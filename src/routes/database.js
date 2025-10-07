const express = require('express');
const mongoose = require('mongoose');
const { body, param, query, validationResult } = require('express-validator');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// GET /api/v1/database/info - Get database information
router.get('/info', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const admin = db.admin();
    
    // Get database stats
    const stats = await db.stats();
    
    // Get server info
    const serverInfo = await admin.serverStatus();
    
    // Get database list
    const databases = await admin.listDatabases();
    
    res.json({
      success: true,
      data: {
        currentDatabase: db.databaseName,
        collections: stats.collections,
        documents: stats.objects,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        indexSize: stats.indexSize,
        serverVersion: serverInfo.version,
        uptime: serverInfo.uptime,
        availableDatabases: databases.databases.map(db => ({
          name: db.name,
          size: db.sizeOnDisk
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching database information',
      error: error.message
    });
  }
});

// GET /api/v1/database/collections - List all collections with detailed info
router.get('/collections', async (req, res) => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    const collectionsWithDetails = await Promise.all(
      collections.map(async (col) => {
        const collection = mongoose.connection.db.collection(col.name);
        const stats = await collection.stats().catch(() => null);
        const count = await collection.countDocuments().catch(() => 0);
        
        // Get indexes
        const indexes = await collection.indexes().catch(() => []);
        
        // Get sample document
        const sampleDoc = await collection.findOne().catch(() => null);
        
        return {
          name: col.name,
          type: col.type,
          documentCount: count,
          size: stats?.size || 0,
          avgObjSize: stats?.avgObjSize || 0,
          indexes: indexes.length,
          indexDetails: indexes,
          sampleDocument: sampleDoc,
          hasData: count > 0
        };
      })
    );

    res.json({
      success: true,
      data: collectionsWithDetails,
      count: collectionsWithDetails.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching collections',
      error: error.message
    });
  }
});

// POST /api/v1/database/collections - Create new collection
router.post('/collections', [
  body('name').notEmpty().withMessage('Collection name is required'),
  body('options').optional().isObject().withMessage('Options must be an object'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { name, options = {} } = req.body;
    
    // Check if collection already exists
    const existingCollections = await mongoose.connection.db.listCollections({ name }).toArray();
    if (existingCollections.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Collection already exists'
      });
    }

    // Create collection
    await mongoose.connection.db.createCollection(name, options);
    
    res.status(201).json({
      success: true,
      message: 'Collection created successfully',
      data: { name, options }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating collection',
      error: error.message
    });
  }
});

// DELETE /api/v1/database/collections/:name - Drop collection
router.delete('/collections/:name', [
  param('name').isString().withMessage('Collection name must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { name } = req.params;
    
    // Check if collection exists
    const existingCollections = await mongoose.connection.db.listCollections({ name }).toArray();
    if (existingCollections.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Collection not found'
      });
    }

    // Drop collection
    await mongoose.connection.db.collection(name).drop();
    
    res.json({
      success: true,
      message: 'Collection dropped successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error dropping collection',
      error: error.message
    });
  }
});

// POST /api/v1/database/collections/:name/indexes - Create index
router.post('/collections/:name/indexes', [
  param('name').isString().withMessage('Collection name must be a string'),
  body('keys').isObject().withMessage('Index keys are required'),
  body('options').optional().isObject().withMessage('Options must be an object'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { name } = req.params;
    const { keys, options = {} } = req.body;
    
    const collection = mongoose.connection.db.collection(name);
    const result = await collection.createIndex(keys, options);
    
    res.status(201).json({
      success: true,
      message: 'Index created successfully',
      data: { indexName: result, keys, options }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating index',
      error: error.message
    });
  }
});

// DELETE /api/v1/database/collections/:name/indexes/:indexName - Drop index
router.delete('/collections/:name/indexes/:indexName', [
  param('name').isString().withMessage('Collection name must be a string'),
  param('indexName').isString().withMessage('Index name must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { name, indexName } = req.params;
    
    const collection = mongoose.connection.db.collection(name);
    await collection.dropIndex(indexName);
    
    res.json({
      success: true,
      message: 'Index dropped successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error dropping index',
      error: error.message
    });
  }
});

// POST /api/v1/database/query - Execute raw MongoDB query
router.post('/query', [
  body('collection').notEmpty().withMessage('Collection name is required'),
  body('operation').isIn(['find', 'findOne', 'count', 'aggregate', 'distinct']).withMessage('Invalid operation'),
  body('query').optional().isObject().withMessage('Query must be an object'),
  body('options').optional().isObject().withMessage('Options must be an object'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { collection: collectionName, operation, query = {}, options = {} } = req.body;
    
    const collection = mongoose.connection.db.collection(collectionName);
    let result;
    
    switch (operation) {
      case 'find':
        result = await collection.find(query, options).toArray();
        break;
      case 'findOne':
        result = await collection.findOne(query, options);
        break;
      case 'count':
        result = await collection.countDocuments(query, options);
        break;
      case 'distinct':
        result = await collection.distinct(query.field, query.query || {}, options);
        break;
      case 'aggregate':
        result = await collection.aggregate(query.pipeline || [], options).toArray();
        break;
    }
    
    res.json({
      success: true,
      data: result,
      operation: operation,
      query: query,
      options: options
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error executing query',
      error: error.message
    });
  }
});

// POST /api/v1/database/backup - Create database backup (export collections)
router.post('/backup', [
  body('collections').optional().isArray().withMessage('Collections must be an array'),
  body('includeData').optional().isBoolean().withMessage('Include data must be boolean'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { collections = [], includeData = true } = req.body;
    
    // Get all collections if none specified
    const allCollections = await mongoose.connection.db.listCollections().toArray();
    const targetCollections = collections.length > 0 
      ? collections 
      : allCollections.map(col => col.name);
    
    const backup = {
      database: mongoose.connection.db.databaseName,
      timestamp: new Date().toISOString(),
      collections: {}
    };
    
    for (const collectionName of targetCollections) {
      const collection = mongoose.connection.db.collection(collectionName);
      
      // Get collection info
      const stats = await collection.stats().catch(() => null);
      const indexes = await collection.indexes().catch(() => []);
      
      backup.collections[collectionName] = {
        name: collectionName,
        documentCount: stats?.count || 0,
        size: stats?.size || 0,
        indexes: indexes,
        data: includeData ? await collection.find({}).toArray() : []
      };
    }
    
    res.json({
      success: true,
      message: 'Backup created successfully',
      data: backup
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating backup',
      error: error.message
    });
  }
});

// POST /api/v1/database/restore - Restore database from backup
router.post('/restore', [
  body('backup').isObject().withMessage('Backup data is required'),
  body('collections').optional().isArray().withMessage('Collections must be an array'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { backup, collections = [] } = req.body;
    
    const targetCollections = collections.length > 0 
      ? collections 
      : Object.keys(backup.collections);
    
    const results = [];
    
    for (const collectionName of targetCollections) {
      if (!backup.collections[collectionName]) {
        continue;
      }
      
      const collection = mongoose.connection.db.collection(collectionName);
      const collectionData = backup.collections[collectionName];
      
      // Clear existing data
      await collection.deleteMany({});
      
      // Restore indexes
      for (const index of collectionData.indexes) {
        if (index.name !== '_id_') { // Skip default _id index
          try {
            await collection.createIndex(index.key, index.options || {});
          } catch (err) {
            // Index might already exist
          }
        }
      }
      
      // Restore data
      if (collectionData.data && collectionData.data.length > 0) {
        await collection.insertMany(collectionData.data);
      }
      
      results.push({
        collection: collectionName,
        documentsRestored: collectionData.data?.length || 0,
        indexesRestored: collectionData.indexes?.length || 0
      });
    }
    
    res.json({
      success: true,
      message: 'Database restored successfully',
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error restoring database',
      error: error.message
    });
  }
});

module.exports = router;

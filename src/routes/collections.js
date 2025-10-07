const express = require('express');
const mongoose = require('mongoose');
const { body, param, query, validationResult } = require('express-validator');
const Schema = require('../models/Schema');

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

// Dynamic model cache
const modelCache = new Map();

// Get or create dynamic model based on schema
const getModelFromSchema = async (collectionName) => {
  if (modelCache.has(collectionName)) {
    return modelCache.get(collectionName);
  }

  // Get schema definition
  const schemaDef = await Schema.getByCollectionName(collectionName);
  
  if (schemaDef) {
    // Use schema-defined model
    const mongooseSchema = schemaDef.generateMongooseSchema();
    const model = mongoose.model(collectionName, mongooseSchema);
    modelCache.set(collectionName, model);
    return model;
  } else {
    // Create dynamic model for collections without schema
    const dynamicSchema = new mongoose.Schema({}, {
      collection: collectionName,
      strict: false,
      timestamps: true
    });
    const model = mongoose.model(collectionName, dynamicSchema);
    modelCache.set(collectionName, model);
    return model;
  }
};

// GET /api/v1/collections - List all collections with their schemas
router.get('/', async (req, res) => {
  try {
    // Get all collections from MongoDB
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    // Get all schemas
    const schemas = await Schema.find({ isActive: true }).lean();
    const schemaMap = schemas.reduce((acc, schema) => {
      acc[schema.collectionName] = schema;
      return acc;
    }, {});

    // Combine collection info with schema info
    const collectionsWithSchemas = await Promise.all(
      collections.map(async (col) => {
        const collection = mongoose.connection.db.collection(col.name);
        const stats = await collection.stats().catch(() => null);
        const count = await collection.countDocuments().catch(() => 0);
        
        return {
          name: col.name,
          type: col.type,
          documentCount: count,
          size: stats?.size || 0,
          avgObjSize: stats?.avgObjSize || 0,
          indexes: stats?.nindexes || 0,
          hasSchema: !!schemaMap[col.name],
          schema: schemaMap[col.name] || null
        };
      })
    );

    res.json({
      success: true,
      data: collectionsWithSchemas,
      count: collectionsWithSchemas.length,
      withSchemas: collectionsWithSchemas.filter(c => c.hasSchema).length,
      withoutSchemas: collectionsWithSchemas.filter(c => !c.hasSchema).length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching collections',
      error: error.message
    });
  }
});

// GET /api/v1/collections/:collectionName - Get collection details
router.get('/:collectionName', [
  param('collectionName').isString().withMessage('Collection name must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { collectionName } = req.params;
    
    // Check if collection exists
    const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
    if (collections.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Collection not found'
      });
    }

    // Get collection stats
    const collection = mongoose.connection.db.collection(collectionName);
    const stats = await collection.stats();
    const count = await collection.countDocuments();

    // Get schema if exists
    const schema = await Schema.getByCollectionName(collectionName);

    // Get sample documents
    const sampleDocs = await collection.find({}).limit(3).toArray();

    // Get field analysis
    const fieldAnalysis = await collection.aggregate([
      { $project: { fields: { $objectToArray: '$$ROOT' } } },
      { $unwind: '$fields' },
      { $group: { 
        _id: '$fields.k', 
        count: { $sum: 1 },
        types: { $addToSet: { $type: '$fields.v' } }
      }},
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]).toArray();

    res.json({
      success: true,
      data: {
        name: collectionName,
        documentCount: count,
        size: stats.size,
        avgObjSize: stats.avgObjSize,
        indexes: stats.nindexes,
        hasSchema: !!schema,
        schema: schema,
        sampleDocuments: sampleDocs,
        fieldAnalysis: fieldAnalysis
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching collection details',
      error: error.message
    });
  }
});

// GET /api/v1/collections/:collectionName/documents - Get documents from collection
router.get('/:collectionName/documents', [
  param('collectionName').isString().withMessage('Collection name must be a string'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('sort').optional().isString().withMessage('Sort must be a string'),
  query('fields').optional().isString().withMessage('Fields must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { collectionName } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query from query parameters
    const query = {};
    const sort = {};
    const fields = req.query.fields ? req.query.fields.split(',').reduce((acc, field) => {
      acc[field.trim()] = 1;
      return acc;
    }, {}) : {};

    // Parse query parameters into MongoDB query
    Object.keys(req.query).forEach(key => {
      if (!['page', 'limit', 'sort', 'fields'].includes(key)) {
        const value = req.query[key];
        
        // Handle different query types
        if (value.startsWith('>')) {
          query[key] = { $gt: parseFloat(value.substring(1)) };
        } else if (value.startsWith('<')) {
          query[key] = { $lt: parseFloat(value.substring(1)) };
        } else if (value.startsWith('>=')) {
          query[key] = { $gte: parseFloat(value.substring(2)) };
        } else if (value.startsWith('<=')) {
          query[key] = { $lte: parseFloat(value.substring(2)) };
        } else if (value.startsWith('!=')) {
          query[key] = { $ne: value.substring(2) };
        } else if (value.startsWith('~')) {
          query[key] = { $regex: value.substring(1), $options: 'i' };
        } else if (value.includes(',')) {
          query[key] = { $in: value.split(',') };
        } else {
          // Try to parse as number, boolean, or keep as string
          if (value === 'true') {
            query[key] = true;
          } else if (value === 'false') {
            query[key] = false;
          } else if (!isNaN(value) && !isNaN(parseFloat(value))) {
            query[key] = parseFloat(value);
          } else {
            query[key] = value;
          }
        }
      }
    });

    // Parse sort parameter
    if (req.query.sort) {
      req.query.sort.split(',').forEach(sortField => {
        if (sortField.startsWith('-')) {
          sort[sortField.substring(1)] = -1;
        } else {
          sort[sortField] = 1;
        }
      });
    } else {
      sort.createdAt = -1; // Default sort
    }

    const model = await getModelFromSchema(collectionName);
    const documents = await model.find(query, fields)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await model.countDocuments(query);

    res.json({
      success: true,
      data: documents,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      query: query,
      sort: sort
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Error fetching documents from ${req.params.collectionName}`,
      error: error.message
    });
  }
});

// POST /api/v1/collections/:collectionName/documents - Create new document
router.post('/:collectionName/documents', async (req, res) => {
  try {
    const { collectionName } = req.params;
    const model = await getModelFromSchema(collectionName);
    
    const document = new model(req.body);
    await document.save();

    res.status(201).json({
      success: true,
      message: 'Document created successfully',
      data: document
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating document',
      error: error.message
    });
  }
});

// PUT /api/v1/collections/:collectionName/documents/:id - Update document
router.put('/:collectionName/documents/:id', [
  param('collectionName').isString().withMessage('Collection name must be a string'),
  param('id').isMongoId().withMessage('Invalid document ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { collectionName, id } = req.params;
    const model = await getModelFromSchema(collectionName);
    
    const document = await model.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    res.json({
      success: true,
      message: 'Document updated successfully',
      data: document
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating document',
      error: error.message
    });
  }
});

// DELETE /api/v1/collections/:collectionName/documents/:id - Delete document
router.delete('/:collectionName/documents/:id', [
  param('collectionName').isString().withMessage('Collection name must be a string'),
  param('id').isMongoId().withMessage('Invalid document ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { collectionName, id } = req.params;
    const model = await getModelFromSchema(collectionName);
    
    const document = await model.findByIdAndDelete(id);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting document',
      error: error.message
    });
  }
});

// POST /api/v1/collections/:collectionName/analyze - Analyze collection structure
router.post('/:collectionName/analyze', [
  param('collectionName').isString().withMessage('Collection name must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { collectionName } = req.params;
    const collection = mongoose.connection.db.collection(collectionName);
    
    // Get comprehensive analysis
    const analysis = await collection.aggregate([
      {
        $project: {
          fields: { $objectToArray: '$$ROOT' }
        }
      },
      { $unwind: '$fields' },
      {
        $group: {
          _id: '$fields.k',
          count: { $sum: 1 },
          types: { $addToSet: { $type: '$fields.v' } },
          uniqueValues: { $addToSet: '$fields.v' },
          sampleValues: { $push: '$fields.v' }
        }
      },
      {
        $project: {
          field: '$_id',
          count: 1,
          types: 1,
          uniqueCount: { $size: '$uniqueValues' },
          sampleValues: { $slice: ['$sampleValues', 5] }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    res.json({
      success: true,
      data: {
        collectionName: collectionName,
        fieldAnalysis: analysis,
        totalFields: analysis.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error analyzing collection',
      error: error.message
    });
  }
});

module.exports = router;

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

// Get or create dynamic model
const getDynamicModel = (collectionName) => {
  if (modelCache.has(collectionName)) {
    return modelCache.get(collectionName);
  }

  // Create a dynamic schema
  const dynamicSchema = new mongoose.Schema({}, {
    collection: collectionName,
    strict: false, // Allow any fields
    timestamps: true
  });

  const model = mongoose.model(collectionName, dynamicSchema);
  modelCache.set(collectionName, model);
  return model;
};

// GET /api/v1/collections - List all collections
router.get('/collections', async (req, res) => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    res.json({
      success: true,
      data: collectionNames,
      count: collectionNames.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching collections',
      error: error.message
    });
  }
});

// GET /api/v1/:collection - Get all documents from a collection
router.get('/:collection', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('sort').optional().isString().withMessage('Sort must be a string'),
  query('fields').optional().isString().withMessage('Fields must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { collection } = req.params;
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

    const model = getDynamicModel(collection);
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
      message: `Error fetching documents from ${req.params.collection}`,
      error: error.message
    });
  }
});

// GET /api/v1/:collection/:id - Get document by ID
router.get('/:collection/:id', [
  param('id').isMongoId().withMessage('Invalid document ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { collection, id } = req.params;
    const model = getDynamicModel(collection);
    const document = await model.findById(id);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    res.json({
      success: true,
      data: document
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching document',
      error: error.message
    });
  }
});

// POST /api/v1/:collection - Create new document
router.post('/:collection', async (req, res) => {
  try {
    const { collection } = req.params;
    const model = getDynamicModel(collection);
    
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

// PUT /api/v1/:collection/:id - Update document
router.put('/:collection/:id', [
  param('id').isMongoId().withMessage('Invalid document ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { collection, id } = req.params;
    const model = getDynamicModel(collection);
    
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

// PATCH /api/v1/:collection/:id - Partial update document
router.patch('/:collection/:id', [
  param('id').isMongoId().withMessage('Invalid document ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { collection, id } = req.params;
    const model = getDynamicModel(collection);
    
    const document = await model.findByIdAndUpdate(
      id,
      { $set: req.body },
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

// DELETE /api/v1/:collection/:id - Delete document
router.delete('/:collection/:id', [
  param('id').isMongoId().withMessage('Invalid document ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { collection, id } = req.params;
    const model = getDynamicModel(collection);
    
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

// POST /api/v1/:collection/bulk - Bulk operations
router.post('/:collection/bulk', [
  body('operation').isIn(['insert', 'update', 'delete']).withMessage('Operation must be insert, update, or delete'),
  body('data').isArray().withMessage('Data must be an array'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { collection } = req.params;
    const { operation, data } = req.body;
    const model = getDynamicModel(collection);
    
    let result;
    
    switch (operation) {
      case 'insert':
        result = await model.insertMany(data);
        break;
      case 'update':
        result = await model.bulkWrite(
          data.map(item => ({
            updateOne: {
              filter: { _id: item._id },
              update: { $set: item }
            }
          }))
        );
        break;
      case 'delete':
        result = await model.deleteMany({
          _id: { $in: data.map(item => item._id) }
        });
        break;
    }

    res.json({
      success: true,
      message: `Bulk ${operation} completed successfully`,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error performing bulk operation',
      error: error.message
    });
  }
});

// GET /api/v1/:collection/stats - Get collection statistics
router.get('/:collection/stats', async (req, res) => {
  try {
    const { collection } = req.params;
    const model = getDynamicModel(collection);
    
    const stats = await model.aggregate([
      {
        $group: {
          _id: null,
          totalDocuments: { $sum: 1 },
          avgSize: { $avg: { $bsonSize: '$$ROOT' } }
        }
      }
    ]);

    const fieldStats = await model.aggregate([
      { $project: { fields: { $objectToArray: '$$ROOT' } } },
      { $unwind: '$fields' },
      { $group: { _id: '$fields.k', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      data: {
        collection: collection,
        totalDocuments: stats[0]?.totalDocuments || 0,
        averageDocumentSize: stats[0]?.avgSize || 0,
        topFields: fieldStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching collection statistics',
      error: error.message
    });
  }
});

module.exports = router;

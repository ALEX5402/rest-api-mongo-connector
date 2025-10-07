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

// GET /api/v1/schemas - Get all schemas
router.get('/', async (req, res) => {
  try {
    const schemas = await Schema.find({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: schemas,
      count: schemas.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching schemas',
      error: error.message
    });
  }
});

// GET /api/v1/schemas/:id - Get schema by ID
router.get('/:id', [
  param('id').isMongoId().withMessage('Invalid schema ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const schema = await Schema.findById(req.params.id);
    
    if (!schema) {
      return res.status(404).json({
        success: false,
        message: 'Schema not found'
      });
    }

    res.json({
      success: true,
      data: schema
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching schema',
      error: error.message
    });
  }
});

// GET /api/v1/schemas/collection/:collectionName - Get schema by collection name
router.get('/collection/:collectionName', [
  param('collectionName').isString().withMessage('Collection name must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const schema = await Schema.getByCollectionName(req.params.collectionName);
    
    if (!schema) {
      return res.status(404).json({
        success: false,
        message: 'Schema not found for this collection'
      });
    }

    res.json({
      success: true,
      data: schema
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching schema',
      error: error.message
    });
  }
});

// POST /api/v1/schemas - Create new schema
router.post('/', [
  body('collectionName').notEmpty().withMessage('Collection name is required'),
  body('displayName').notEmpty().withMessage('Display name is required'),
  body('fields').isArray().withMessage('Fields must be an array'),
  body('fields.*.name').notEmpty().withMessage('Field name is required'),
  body('fields.*.type').isIn(['String', 'Number', 'Boolean', 'Date', 'ObjectId', 'Array', 'Object', 'Mixed']).withMessage('Invalid field type'),
  handleValidationErrors
], async (req, res) => {
  try {
    // Check if collection name already exists
    const existingSchema = await Schema.findOne({ 
      collectionName: req.body.collectionName.toLowerCase() 
    });

    if (existingSchema) {
      return res.status(409).json({
        success: false,
        message: 'Schema with this collection name already exists'
      });
    }

    const schema = new Schema({
      ...req.body,
      collectionName: req.body.collectionName.toLowerCase()
    });

    await schema.save();

    // Create the actual MongoDB collection with the schema
    const mongooseSchema = schema.generateMongooseSchema();
    const model = mongoose.model(schema.collectionName, mongooseSchema);

    res.status(201).json({
      success: true,
      message: 'Schema created successfully',
      data: schema
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating schema',
      error: error.message
    });
  }
});

// PUT /api/v1/schemas/:id - Update schema
router.put('/:id', [
  param('id').isMongoId().withMessage('Invalid schema ID'),
  body('displayName').optional().notEmpty().withMessage('Display name cannot be empty'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('fields').optional().isArray().withMessage('Fields must be an array'),
  handleValidationErrors
], async (req, res) => {
  try {
    const schema = await Schema.findById(req.params.id);
    
    if (!schema) {
      return res.status(404).json({
        success: false,
        message: 'Schema not found'
      });
    }

    // Update fields
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined && key !== 'collectionName') {
        schema[key] = req.body[key];
      }
    });

    schema.updatedAt = new Date();
    await schema.save();

    res.json({
      success: true,
      message: 'Schema updated successfully',
      data: schema
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating schema',
      error: error.message
    });
  }
});

// DELETE /api/v1/schemas/:id - Delete schema (soft delete)
router.delete('/:id', [
  param('id').isMongoId().withMessage('Invalid schema ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const schema = await Schema.findById(req.params.id);
    
    if (!schema) {
      return res.status(404).json({
        success: false,
        message: 'Schema not found'
      });
    }

    // Soft delete - mark as inactive
    schema.isActive = false;
    await schema.save();

    res.json({
      success: true,
      message: 'Schema deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting schema',
      error: error.message
    });
  }
});

// GET /api/v1/schemas/:id/collections - Get collections created from this schema
router.get('/:id/collections', [
  param('id').isMongoId().withMessage('Invalid schema ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const schema = await Schema.findById(req.params.id);
    
    if (!schema) {
      return res.status(404).json({
        success: false,
        message: 'Schema not found'
      });
    }

    // Get collection info from MongoDB
    const collection = mongoose.connection.db.collection(schema.collectionName);
    const stats = await collection.stats();
    const count = await collection.countDocuments();

    res.json({
      success: true,
      data: {
        schema: schema,
        collection: {
          name: schema.collectionName,
          documentCount: count,
          size: stats.size,
          avgObjSize: stats.avgObjSize,
          indexes: stats.nindexes
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching collection info',
      error: error.message
    });
  }
});

// POST /api/v1/schemas/:id/validate - Validate data against schema
router.post('/:id/validate', [
  param('id').isMongoId().withMessage('Invalid schema ID'),
  body('data').isObject().withMessage('Data must be an object'),
  handleValidationErrors
], async (req, res) => {
  try {
    const schema = await Schema.findById(req.params.id);
    
    if (!schema) {
      return res.status(404).json({
        success: false,
        message: 'Schema not found'
      });
    }

    const mongooseSchema = schema.generateMongooseSchema();
    const model = mongoose.model(`temp_${schema.collectionName}`, mongooseSchema);
    
    // Create a temporary document to validate
    const tempDoc = new model(req.body.data);
    const validationError = tempDoc.validateSync();

    if (validationError) {
      const errors = Object.keys(validationError.errors).map(key => ({
        field: key,
        message: validationError.errors[key].message,
        value: validationError.errors[key].value
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    res.json({
      success: true,
      message: 'Data is valid according to schema',
      data: req.body.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error validating data',
      error: error.message
    });
  }
});

// GET /api/v1/schemas/export/:id - Export schema as JSON
router.get('/export/:id', [
  param('id').isMongoId().withMessage('Invalid schema ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const schema = await Schema.findById(req.params.id);
    
    if (!schema) {
      return res.status(404).json({
        success: false,
        message: 'Schema not found'
      });
    }

    const exportData = {
      collectionName: schema.collectionName,
      displayName: schema.displayName,
      description: schema.description,
      fields: schema.fields,
      indexes: schema.indexes,
      validationRules: schema.validationRules,
      createdAt: schema.createdAt,
      updatedAt: schema.updatedAt
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${schema.collectionName}-schema.json"`);
    res.json(exportData);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error exporting schema',
      error: error.message
    });
  }
});

module.exports = router;

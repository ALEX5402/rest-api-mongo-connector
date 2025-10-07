const mongoose = require('mongoose');

const schemaDefinitionSchema = new mongoose.Schema({
  collectionName: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  fields: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      required: true,
      enum: ['String', 'Number', 'Boolean', 'Date', 'ObjectId', 'Array', 'Object', 'Mixed']
    },
    required: {
      type: Boolean,
      default: false
    },
    unique: {
      type: Boolean,
      default: false
    },
    index: {
      type: Boolean,
      default: false
    },
    default: mongoose.Schema.Types.Mixed,
    enum: [String],
    min: Number,
    max: Number,
    minLength: Number,
    maxLength: Number,
    pattern: String, // regex pattern
    ref: String, // for ObjectId references
    description: String
  }],
  indexes: [{
    fields: mongoose.Schema.Types.Mixed, // {field1: 1, field2: -1}
    options: {
      unique: Boolean,
      sparse: Boolean,
      background: Boolean
    }
  }],
  validationRules: {
    type: mongoose.Schema.Types.Mixed
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for collection name (removed duplicate - already defined in schema)

// Method to generate mongoose schema
schemaDefinitionSchema.methods.generateMongooseSchema = function() {
  const schemaFields = {};
  
  this.fields.forEach(field => {
    let fieldType;
    
    switch (field.type) {
      case 'String':
        fieldType = String;
        break;
      case 'Number':
        fieldType = Number;
        break;
      case 'Boolean':
        fieldType = Boolean;
        break;
      case 'Date':
        fieldType = Date;
        break;
      case 'ObjectId':
        fieldType = mongoose.Schema.Types.ObjectId;
        break;
      case 'Array':
        fieldType = [mongoose.Schema.Types.Mixed];
        break;
      case 'Object':
        fieldType = mongoose.Schema.Types.Mixed;
        break;
      case 'Mixed':
        fieldType = mongoose.Schema.Types.Mixed;
        break;
      default:
        fieldType = mongoose.Schema.Types.Mixed;
    }
    
    const fieldConfig = {
      type: fieldType,
      required: field.required,
      unique: field.unique,
      index: field.index
    };
    
    if (field.default !== undefined) {
      fieldConfig.default = field.default;
    }
    
    if (field.enum && field.enum.length > 0) {
      fieldConfig.enum = field.enum;
    }
    
    if (field.min !== undefined) {
      fieldConfig.min = field.min;
    }
    
    if (field.max !== undefined) {
      fieldConfig.max = field.max;
    }
    
    if (field.minLength !== undefined) {
      fieldConfig.minlength = field.minLength;
    }
    
    if (field.maxLength !== undefined) {
      fieldConfig.maxlength = field.maxLength;
    }
    
    if (field.pattern) {
      fieldConfig.match = new RegExp(field.pattern);
    }
    
    if (field.ref) {
      fieldConfig.ref = field.ref;
    }
    
    schemaFields[field.name] = fieldConfig;
  });
  
  return new mongoose.Schema(schemaFields, {
    timestamps: true,
    collection: this.collectionName
  });
};

// Static method to get all active schemas
schemaDefinitionSchema.statics.getActiveSchemas = function() {
  return this.find({ isActive: true });
};

// Static method to get schema by collection name
schemaDefinitionSchema.statics.getByCollectionName = function(collectionName) {
  return this.findOne({ collectionName: collectionName.toLowerCase(), isActive: true });
};

module.exports = mongoose.model('Schema', schemaDefinitionSchema);

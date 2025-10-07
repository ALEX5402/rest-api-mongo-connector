const config = require('../config');

// API Key authentication middleware
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'API key is required. Please provide it in the X-API-Key header or Authorization header.'
    });
  }

  if (apiKey !== config.api.key) {
    return res.status(403).json({
      success: false,
      message: 'Invalid API key. Access denied.'
    });
  }

  // Add API key info to request for logging purposes
  req.apiKey = apiKey;
  next();
};

// Optional API key authentication (for public endpoints that can work with or without auth)
const optionalApiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (apiKey) {
    if (apiKey !== config.api.key) {
      return res.status(403).json({
        success: false,
        message: 'Invalid API key. Access denied.'
      });
    }
    req.apiKey = apiKey;
    req.authenticated = true;
  } else {
    req.authenticated = false;
  }
  
  next();
};

// Generate a new API key (utility function)
const generateApiKey = () => {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
};

module.exports = {
  authenticateApiKey,
  optionalApiKeyAuth,
  generateApiKey
};

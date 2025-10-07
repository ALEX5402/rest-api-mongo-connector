require('dotenv').config();

module.exports = {
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/payment_api'
  },
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },
  api: {
    version: process.env.API_VERSION || 'v1',
    key: process.env.API_KEY || 'your-secret-api-key-here'
  }
};

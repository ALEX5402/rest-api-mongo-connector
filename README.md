# Payment API MongoDB Connector

A RESTful API for managing payments and users with MongoDB integration, designed for Android applications.

## Features

- **User Management**: Create, read, update, and delete users
- **Payment Processing**: Full CRUD operations for payments
- **MongoDB Integration**: Robust database connection with Mongoose
- **Rate Limiting**: Built-in protection against abuse
- **Input Validation**: Comprehensive request validation
- **Error Handling**: Proper error responses and logging
- **Security**: Helmet.js for security headers and CORS configuration

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or MongoDB Atlas)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd payment-api-mongo-connector
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/payment_api
# For MongoDB Atlas, use: mongodb+srv://username:password@cluster.mongodb.net/payment_api

# Server Configuration
PORT=3000
NODE_ENV=development

# API Configuration
API_VERSION=v1
API_KEY=your-secret-api-key-here
```

4. Generate a secure API key:
```bash
curl http://localhost:3000/generate-api-key
```
Copy the generated API key and update your `.env` file.

5. Start the server:
```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

## API Endpoints

### Public Endpoints
- `GET /health` - Check if the API is running
- `GET /generate-api-key` - Generate a new API key (for development)

### Protected Endpoints (Require API Key)
All API endpoints below require authentication via API key in the header:
- Header: `X-API-Key: your-api-key-here`
- Or: `Authorization: Bearer your-api-key-here`

### Payments
- `GET /api/v1/payments` - Get all payments (with pagination and filtering)
- `GET /api/v1/payments/:id` - Get payment by ID
- `POST /api/v1/payments` - Create new payment
- `PUT /api/v1/payments/:id` - Update payment
- `PATCH /api/v1/payments/:id/status` - Update payment status
- `DELETE /api/v1/payments/:id` - Delete payment
- `GET /api/v1/payments/user/:userId` - Get payments by user ID

### Users
- `GET /api/v1/users` - Get all users (with pagination)
- `GET /api/v1/users/:id` - Get user by ID
- `POST /api/v1/users` - Create new user
- `PUT /api/v1/users/:id` - Update user
- `PATCH /api/v1/users/:id/payment-methods` - Add payment method to user
- `GET /api/v1/users/:id/payment-methods` - Get user payment methods
- `GET /api/v1/users/:id/stats` - Get user payment statistics
- `DELETE /api/v1/users/:id` - Delete user

## Example Usage

### Create a User
```bash
curl -X POST http://localhost:3000/api/v1/users \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "userId": "user123",
    "email": "user@example.com",
    "name": "John Doe",
    "phone": "+1234567890"
  }'
```

### Create a Payment
```bash
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "userId": "user123",
    "amount": 99.99,
    "currency": "USD",
    "paymentMethod": "credit_card",
    "description": "Purchase of premium subscription"
  }'
```

### Get User Payments
```bash
curl -H "X-API-Key: your-api-key-here" \
  http://localhost:3000/api/v1/payments/user/user123
```

### Using Authorization Header (Alternative)
```bash
curl -H "Authorization: Bearer your-api-key-here" \
  http://localhost:3000/api/v1/users
```

## Data Models

### User Model
```javascript
{
  userId: String (required, unique),
  email: String (required, unique),
  name: String (required),
  phone: String,
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  paymentMethods: [{
    type: String,
    lastFour: String,
    brand: String,
    isDefault: Boolean
  }],
  preferences: {
    currency: String,
    notifications: {
      email: Boolean,
      push: Boolean
    }
  },
  isActive: Boolean,
  lastLogin: Date
}
```

### Payment Model
```javascript
{
  userId: String (required),
  amount: Number (required, min: 0),
  currency: String (default: "USD"),
  paymentMethod: String (enum),
  status: String (enum, default: "pending"),
  transactionId: String (unique),
  description: String,
  metadata: Object,
  paymentDate: Date,
  completedDate: Date
}
```

## Rate Limiting

- General API: 100 requests per 15 minutes per IP
- Payment operations: 20 requests per 15 minutes per IP
- User creation: 5 requests per hour per IP

## Error Handling

All errors are returned in a consistent format:
```json
{
  "success": false,
  "message": "Error description",
  "errors": [] // Validation errors (if any)
}
```

## Development

### Project Structure
```
├── config.js              # Configuration settings
├── index.js               # Main server file
├── database/
│   └── connection.js      # MongoDB connection
├── models/
│   ├── Payment.js         # Payment model
│   └── User.js            # User model
├── routes/
│   ├── payments.js        # Payment routes
│   └── users.js           # User routes
├── middleware/
│   ├── errorHandler.js    # Error handling
│   └── rateLimiter.js     # Rate limiting
└── package.json
```

### Environment Variables
- `MONGODB_URI`: MongoDB connection string
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)
- `API_VERSION`: API version (default: v1)
- `API_KEY`: Secret API key for authentication (required)

## Security Features

- **API Key Authentication**: All endpoints require valid API key
- **Helmet.js**: Security headers protection
- **CORS Configuration**: Cross-origin request control
- **Rate Limiting**: Protection against abuse and DDoS
- **Input Validation**: Comprehensive request validation
- **Error Handling**: Secure error responses without sensitive data exposure
- **Environment Variables**: Secure configuration management

## License

ISC

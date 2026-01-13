// Test setup - runs before all tests
const path = require('path');

// Load test environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });

// Disable Redis for tests
process.env.REDIS_ENABLED = 'false';
process.env.NODE_ENV = 'test';

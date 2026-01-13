// Test setup - runs before all tests
const path = require('path');

// Load test environment variables (quiet mode to suppress tips)
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test'), quiet: true });

// Disable Redis for tests
process.env.REDIS_ENABLED = 'false';
process.env.NODE_ENV = 'test';

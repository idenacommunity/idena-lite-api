const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Idena Lite API',
      version: '0.1.0-alpha',
      description:
        'Community-maintained lightweight REST API for the Idena blockchain. Provides cached access to identity, epoch, and stake data.',
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
      contact: {
        name: 'Idena Community',
        url: 'https://github.com/idenacommunity/idena-lite-api',
      },
    },
    servers: [
      {
        url: '/',
        description: 'Current server',
      },
    ],
    tags: [
      {
        name: 'Health',
        description: 'Health check and status endpoints',
      },
      {
        name: 'Identity',
        description: 'Identity and stake information',
      },
      {
        name: 'Epoch',
        description: 'Epoch and validation ceremony information',
      },
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'Error message',
                },
                status: {
                  type: 'integer',
                  description: 'HTTP status code',
                },
              },
            },
          },
        },
        Identity: {
          type: 'object',
          properties: {
            address: {
              type: 'string',
              description: 'Idena address',
              example: '0x1234567890abcdef1234567890abcdef12345678',
            },
            state: {
              type: 'string',
              description: 'Identity state',
              enum: [
                'Undefined',
                'Invite',
                'Candidate',
                'Newbie',
                'Verified',
                'Suspended',
                'Zombie',
                'Killed',
                'Human',
              ],
              example: 'Human',
            },
            stake: {
              type: 'string',
              description: 'Stake amount in DNA',
              example: '1000.5',
            },
            age: {
              type: 'integer',
              description: 'Identity age in epochs',
              example: 15,
            },
          },
        },
        Epoch: {
          type: 'object',
          properties: {
            epoch: {
              type: 'integer',
              description: 'Current epoch number',
              example: 150,
            },
            nextValidation: {
              type: 'string',
              format: 'date-time',
              description: 'Next validation ceremony time',
            },
            currentPeriod: {
              type: 'string',
              description: 'Current period in the epoch',
              example: 'None',
            },
          },
        },
        CeremonyIntervals: {
          type: 'object',
          properties: {
            FlipLotteryDuration: {
              type: 'integer',
              description: 'Flip lottery duration in seconds',
            },
            ShortSessionDuration: {
              type: 'integer',
              description: 'Short session duration in seconds',
            },
            LongSessionDuration: {
              type: 'integer',
              description: 'Long session duration in seconds',
            },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            api: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  example: 'operational',
                },
                version: {
                  type: 'string',
                  example: '1.0.0',
                },
                uptime: {
                  type: 'number',
                  description: 'Server uptime in seconds',
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                },
              },
            },
            idenaNode: {
              type: 'object',
              properties: {
                healthy: {
                  type: 'boolean',
                },
                currentEpoch: {
                  type: 'integer',
                },
                error: {
                  type: 'string',
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                },
              },
            },
            cache: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  enum: ['connected', 'disconnected', 'disabled'],
                },
                enabled: {
                  type: 'boolean',
                },
              },
            },
          },
        },
        PaginatedIdentities: {
          type: 'object',
          properties: {
            total: {
              type: 'integer',
              description: 'Total number of matching identities',
            },
            limit: {
              type: 'integer',
              description: 'Number of results per page',
            },
            offset: {
              type: 'integer',
              description: 'Offset from the beginning',
            },
            data: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Identity',
              },
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;

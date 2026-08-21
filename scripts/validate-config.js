const fs = require('fs');
const Ajv = require('ajv');

// JSON Schema for config.json
const schema = {
  type: 'object',
  required: ['sync_mode', 'actual_server_url', 'actual_password', 'accounts'],
  properties: {
    sync_mode: {
      type: 'string',
      enum: ['v1', 'v2'],
      description: 'Synchronization mode: v1 for OFX export, v2 for Actual Budget API'
    },
    cron_schedule: {
      type: 'string',
      pattern: '^(\\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\\*/([0-9]|[1-5][0-9])) (\\*|([0-9]|1[0-9]|2[0-3])|\\*/([0-9]|1[0-9]|2[0-3])) (\\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\\*/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\\*|([1-9]|1[0-2])|\\*/([1-9]|1[0-2])) (\\*|([0-6])|\\*/([0-6]))$',
      default: '0 5 * * *',
      description: 'Cron schedule for sync job (min hour day month weekday)'
    },
    actual_server_url: {
      type: 'string',
      description: 'Actual Budget server URL'
    },
    actual_password: {
      type: 'string',
      description: 'Actual Budget password'
    },
    actual_encryption_password: {
      oneOf: [
        { type: 'string' },
        { type: 'null' }
      ],
      description: 'Optional Actual Budget encryption password'
    },
    woob_history_count: {
      type: 'integer',
      default: 200,
      minimum: 1,
      description: 'Number of transactions to fetch from Woob'
    },
    accounts: {
      type: 'array',
      minItems: 1,
      description: 'Array of bank accounts to sync',
      items: {
        type: 'object',
        required: ['name', 'woob_account_id'],
        properties: {
          name: {
            type: 'string',
            description: 'Human-readable account name'
          },
          woob_account_id: {
            type: 'string',
            description: 'Account ID from Woob'
          },
          actual_budget_id: {
            type: 'string',
            description: 'Sync ID from Actual Budget'
          },
          actual_account_id: {
            type: 'string',
            description: 'Account ID from Actual Budget'
          },
          enabled: {
            type: 'boolean',
            default: true,
            description: 'Whether this account should be synced'
          }
        },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

// Validate a config file path
function validateConfig(configPath) {
  let config;

  // Read and parse the config file
  try {
    const fileContents = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(fileContents);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Config file not found: ${configPath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in config file: ${error.message}`);
    }
    throw error;
  }

  // Validate against schema
  const ajv = new Ajv({ useDefaults: true });
  const validate = ajv.compile(schema);
  const isValid = validate(config);

  if (!isValid) {
    const errorMessages = validate.errors
      .map(error => {
        const path = error.instancePath || 'root';
        return `${path} ${error.message}`;
      })
      .join('\n');
    throw new Error(`Config validation failed:\n${errorMessages}`);
  }

  return config;
}

module.exports = { validateConfig, schema };

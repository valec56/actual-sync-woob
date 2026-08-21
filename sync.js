const { execSync } = require('child_process');
const { api } = require('@actual-app/api');
const fs = require('fs');
const path = require('path');
const { validateConfig } = require('./scripts/validate-config');

// Temporary file paths
const EXPORT_PATH = '/tmp/export.ofx';
const ACTUAL_DATA_DIR = '/tmp/actual-data';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      'config.json not found. Run ./scripts/setup.sh to create it.'
    );
  }
  return validateConfig(configPath);
}

const config = loadConfig();

async function fetchWoobTransactions(woobAccountId, historyCount = 200) {
  console.log(`  [Woob] Updating modules...`);
  execSync('woob config update', { stdio: 'inherit' });

  console.log(`  [Woob] Fetching ${historyCount} transactions...`);
  const cmd = `woob bank history "${woobAccountId}" -f ofx -n ${historyCount}`;
  const output = execSync(cmd, { encoding: 'utf8' });

  if (!output.trim()) {
    throw new Error(`Woob returned empty output for account ${woobAccountId}`);
  }

  return Buffer.from(output);
}

async function importIntoActual(
  serverUrl,
  password,
  budgetId,
  accountId,
  encryptionPassword,
  ofxBuffer
) {
  const TEMP_DIR = '/tmp/actual-data-' + Date.now();
  let initialized = false;

  try {
    console.log(`  [Actual] Connecting to Actual Budget instance...`);
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    await api.init({ dataDir: TEMP_DIR, serverURL: serverUrl, password });
    initialized = true;

    console.log(`  [Actual] Opening budget...`);
    const downloadOpts = encryptionPassword ? { password: encryptionPassword } : undefined;
    await api.downloadBudget(budgetId, downloadOpts);

    console.log(`  [Actual] Importing transactions...`);
    const result = await api.importTransactions(accountId, ofxBuffer);

    console.log(`  [Actual] ✓ Added: ${result.added.length}, Updated: ${result.updated.length}`);
  } finally {
    if (initialized) {
      await api.shutdown();
    }
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  }
}

async function syncAccount(account) {
  // Fetch Woob transactions for this specific account
  const ofxBuffer = await fetchWoobTransactions(
    account.woob_account_id,
    config.woob_history_count || 200
  );

  if (ofxBuffer.length === 0) {
    throw new Error(
      `Empty OFX file for account ${account.name} (${account.woob_account_id})`
    );
  }

  // Import into Actual Budget for this specific account
  await importIntoActual(
    account.actual_server_url || config.actual_server_url,
    account.actual_password || config.actual_password,
    account.actual_budget_id,
    account.actual_account_id,
    account.actual_encryption_password || config.actual_encryption_password,
    ofxBuffer
  );
}

async function run() {
  console.log(`[${new Date().toISOString()}] 🚀 Starting synchronization...`);

  const enabledAccounts = config.accounts.filter(a => a.enabled);

  if (enabledAccounts.length === 0) {
    throw new Error('No enabled accounts in config.json');
  }

  console.log(`[SYNC] Processing ${enabledAccounts.length} account(s)`);

  for (const account of enabledAccounts) {
    try {
      console.log(`[SYNC] Processing account: ${account.name}`);
      await syncAccount(account);
      console.log(`[SYNC] ✓ ${account.name} synced successfully`);
    } catch (err) {
      console.error(`[ERROR] Failed to sync ${account.name}:`, err.message);
      // Continue with next account — don't stop the whole run
    }
  }

  console.log(`[SYNC] All accounts processed`);
  console.log('🏁 Done.');
}

run().catch((error) => {
  console.error('❌ Sync failed:', error.message || error);
  process.exit(1);
});

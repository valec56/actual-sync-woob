const { execSync } = require('child_process');
const { api } = require('@actual-app/api');
const fs = require('fs');

// Temporary file paths
const EXPORT_PATH = '/tmp/export.ofx';
const ACTUAL_DATA_DIR = '/tmp/actual-data';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function run() {
  console.log(`[${new Date().toISOString()}] 🚀 Starting synchronization...`);

  // Validate required env vars upfront so we fail before doing any work
  const accountId = requireEnv('WOOB_ACCOUNT_ID');
  const serverURL = requireEnv('ACTUAL_SERVER_URL');
  const password = requireEnv('ACTUAL_PASSWORD');
  const budgetId = requireEnv('ACTUAL_BUDGET_ID');
  const actualAccountId = requireEnv('ACTUAL_ACCOUNT_ID');
  const historyCount = process.env.WOOB_HISTORY_COUNT || '200';
  const encryptionPassword = process.env.ACTUAL_ENCRYPTION_PASSWORD;

  let initialized = false;
  try {
    // 1. Refresh Woob modules (matches the v1 download.sh behaviour)
    console.log('🔄 Updating Woob modules...');
    execSync('woob config update', { stdio: 'inherit' });

    // 2. Fetch transactions via Woob
    console.log('📥 Fetching OFX file from the bank via Woob...');
    execSync(`woob bank history "${accountId}" -f ofx -n ${historyCount} > ${EXPORT_PATH}`, { stdio: 'inherit' });

    if (!fs.existsSync(EXPORT_PATH) || fs.statSync(EXPORT_PATH).size === 0) {
      // Woob can exit 0 while producing an empty file on auth/2FA failures
      throw new Error('The OFX file exported by Woob is empty or missing.');
    }

    // 3. Initialize the Actual API
    console.log('🔗 Connecting to the Actual Budget instance...');
    fs.mkdirSync(ACTUAL_DATA_DIR, { recursive: true });
    await api.init({ dataDir: ACTUAL_DATA_DIR, serverURL, password });
    initialized = true;

    // 4. Open the budget (only forward the encryption password if it was set)
    console.log('📂 Opening the budget...');
    const downloadOpts = encryptionPassword ? { password: encryptionPassword } : undefined;
    await api.downloadBudget(budgetId, downloadOpts);

    // 5. Import transactions into the target account
    console.log('💾 Injecting transactions into Actual Budget...');
    const fileBuffer = fs.readFileSync(EXPORT_PATH);
    const result = await api.importTransactions(actualAccountId, fileBuffer);

    console.log(`✅ Sync successful! Added: ${result.added.length}, Updated: ${result.updated.length}`);
  } finally {
    console.log('🧹 Cleaning up temporary files...');
    if (fs.existsSync(EXPORT_PATH)) fs.unlinkSync(EXPORT_PATH);
    if (initialized) await api.shutdown();
    console.log('🏁 Done.');
  }
}

run().catch((error) => {
  console.error('❌ Sync failed:', error.message || error);
  process.exit(1);
});

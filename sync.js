const { execSync } = require('child_process');
const { api } = require('@actual-app/api');
const fs = require('fs');
const path = require('path');

// Temporary file paths
const EXPORT_PATH = '/tmp/export.ofx';
const ACTUAL_DATA_DIR = '/tmp/actual-data';

async function run() {
  console.log(`[${new Date().toISOString()}] 🚀 Starting synchronization...`);

  try {
    // 1. Fetch transactions via Woob
    console.log("📥 Fetching OFX file from the bank via Woob...");
    const accountId = process.env.WOOB_ACCOUNT_ID;
    if (!accountId) throw new Error('WOOB_ACCOUNT_ID is required.');
    const historyCount = process.env.WOOB_HISTORY_COUNT || '200';
    execSync(`woob bank history "${accountId}" -f ofx -n ${historyCount} > ${EXPORT_PATH}`, { stdio: 'inherit' });

    if (!fs.existsSync(EXPORT_PATH) || fs.statSync(EXPORT_PATH).size === 0) {
      throw new Error("The OFX file exported by Woob is empty or missing.");
    }

    // 2. Initialize the Actual API
    console.log("🔗 Connecting to the Actual Budget instance...");
    await api.init({
      dataDir: ACTUAL_DATA_DIR,
      serverURL: process.env.ACTUAL_SERVER_URL,
      password: process.env.ACTUAL_PASSWORD
    });

    // 3. Open the budget (handles end-to-end encryption if enabled)
    console.log("📂 Opening the budget...");
    await api.downloadBudget(process.env.ACTUAL_BUDGET_ID, {
      password: process.env.ACTUAL_ENCRYPTION_PASSWORD // Optional: only if the budget is encrypted
    });

    // 4. Import transactions into the target account
    console.log("💾 Injecting transactions into Actual Budget...");
    const fileBuffer = fs.readFileSync(EXPORT_PATH);
    const result = await api.importTransactions(process.env.ACTUAL_ACCOUNT_ID, fileBuffer);

    console.log(`✅ Sync successful! Added: ${result.added.length}, Updated: ${result.updated.length}`);

  } catch (error) {
    console.error("❌ Sync failed:", error.message || error);
  } finally {
    // 5. Clean up temporary files
    console.log("🧹 Cleaning up temporary files...");
    if (fs.existsSync(EXPORT_PATH)) fs.unlinkSync(EXPORT_PATH);

    try {
      await api.shutdown();
    } catch (e) {
      // Ignore if the API was never initialized
    }
    console.log("🏁 Done.");
  }
}

run();

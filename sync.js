const { execSync } = require('child_process');
const actualApi = require('@actual-app/api');
const fs = require('fs');
const path = require('path');
const { validateConfig } = require('./scripts/validate-config');

const ACTUAL_DATA_DIR = '/tmp/actual-data';

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

// Parse an OFX SGML string (Woob format) into an array of Actual Budget
// transaction objects { date, amount, payee_name, notes, imported_id }.
// Amounts are in integer cents (100 = $1.00), negative for debits.
function parseOFX(ofxStr) {
  const transactions = [];
  const stmtBlocks = ofxStr.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];

  for (const block of stmtBlocks) {
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}>([^<\r\n]+)`, 'i'));
      return m ? m[1].trim() : null;
    };

    const dtposted = get('DTPOSTED');
    const trnamt = get('TRNAMT');
    const fitid = get('FITID');

    if (!dtposted || !trnamt || !fitid) continue;

    // DTPOSTED: YYYYMMDDHHMMSS or YYYYMMDD → YYYY-MM-DD
    const date = `${dtposted.slice(0, 4)}-${dtposted.slice(4, 6)}-${dtposted.slice(6, 8)}`;

    // Actual Budget amounts: integers in cents (multiply by 100, round)
    const amount = Math.round(parseFloat(trnamt) * 100);

    transactions.push({
      date,
      amount,
      payee_name: get('NAME') || '',
      notes: get('MEMO') || '',
      imported_id: fitid,
      cleared: true,
    });
  }

  return transactions;
}

async function fetchWoobTransactions(woobAccountId, historyCount = 200) {
  console.log(`  [Woob] Updating modules...`);
  execSync('woob config update', { stdio: 'inherit' });

  console.log(`  [Woob] Fetching ${historyCount} transactions...`);
  const cmd = `woob bank history "${woobAccountId}" -f ofx -n ${historyCount}`;
  const output = execSync(cmd, { encoding: 'utf8' });

  if (!output.trim()) {
    throw new Error(`Woob returned empty output for account ${woobAccountId}`);
  }

  return output;
}

async function importIntoActual(
  serverUrl,
  password,
  budgetId,
  accountId,
  encryptionPassword,
  ofxStr
) {
  const TEMP_DIR = '/tmp/actual-data-' + process.pid;
  let initialized = false;

  try {
    console.log(`  [Actual] Connecting to Actual Budget instance...`);
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    await actualApi.init({ dataDir: TEMP_DIR, serverURL: serverUrl, password });
    initialized = true;

    console.log(`  [Actual] Opening budget...`);
    const downloadOpts = encryptionPassword ? { password: encryptionPassword } : undefined;
    await actualApi.downloadBudget(budgetId, downloadOpts);

    const transactions = parseOFX(ofxStr);
    if (transactions.length === 0) {
      throw new Error('OFX parser found no transactions in Woob output');
    }

    console.log(`  [Actual] Importing ${transactions.length} transactions...`);
    const result = await actualApi.importTransactions(accountId, transactions);

    console.log(`  [Actual] ✓ Added: ${result.added.length}, Updated: ${result.updated.length}`);
  } finally {
    if (initialized) {
      await actualApi.shutdown();
    }
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  }
}

async function syncAccount(account) {
  const ofxStr = await fetchWoobTransactions(
    account.woob_account_id,
    config.woob_history_count || 200
  );

  await importIntoActual(
    account.actual_server_url || config.actual_server_url,
    account.actual_password || config.actual_password,
    account.actual_budget_id,
    account.actual_account_id,
    account.actual_encryption_password || config.actual_encryption_password,
    ofxStr
  );
}

async function run() {
  console.log(`[${new Date().toISOString()}] Starting synchronization...`);

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
    }
  }

  console.log(`[SYNC] All accounts processed`);
  console.log('Done.');
}

run().catch((error) => {
  console.error('Sync failed:', error.message || error);
  process.exit(1);
});

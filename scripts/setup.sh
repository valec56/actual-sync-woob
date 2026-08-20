#!/bin/bash
set -e

# Interactive setup wizard for actual-sync-woob
# Guides users through Woob configuration and generates config.json

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Helper function to print errors
error() {
  echo -e "${RED}ERROR: $1${NC}" >&2
}

# Helper function to print success messages
success() {
  echo -e "${GREEN}$1${NC}"
}

# Helper function to print info messages
info() {
  echo -e "${YELLOW}$1${NC}"
}

# Step 1: Verify Woob is installed
echo "========================================="
echo "actual-sync-woob Setup Wizard"
echo "========================================="
echo

info "Step 1/5: Checking Woob installation..."
if ! command -v woob &> /dev/null; then
  error "Woob not found. Please install Woob first:"
  echo "  pip install woob"
  exit 1
fi
success "✓ Woob is installed"
echo

# Step 2: Interactive Woob bank config
info "Step 2/5: Configure Woob Bank Module"
echo "  This will open an interactive Woob configuration wizard."
echo "  You need to provide your bank credentials once."
echo
read -p "  Press Enter to continue..." || true
woob config add bank
echo
success "✓ Woob bank configuration complete"
echo

# Step 3: List available accounts
info "Step 3/5: List available accounts from your bank"
echo "  The following accounts were detected:"
echo "  Note the woob_account_id values below — you'll need them."
echo
woob bank accounts
echo
read -p "Press Enter to continue..." || true
echo

# Step 4: Collect Actual Budget credentials interactively
info "Step 4/5: Create config.json"
echo
read -p "  Sync mode (v1=OFX only, v2=Actual Budget) [v2]: " sync_mode
sync_mode="${sync_mode:-v2}"

read -p "  Cron schedule (cron format) [0 5 * * *]: " cron_schedule
cron_schedule="${cron_schedule:-0 5 * * *}"

read -p "  ACTUAL_SERVER_URL (default: http://actual:5006): " actual_url
actual_url="${actual_url:-http://actual:5006}"

read -sp "  ACTUAL_PASSWORD: " actual_password
echo

read -p "  ACTUAL_ENCRYPTION_PASSWORD (leave empty if not encrypted): " encryption_password

read -p "  Woob history count (number of past days) [200]: " woob_history_count
woob_history_count="${woob_history_count:-200}"

# Array to collect accounts
declare -a accounts=()
account_count=0

echo
info "Step 5/5: Add accounts"
echo "  You will now be prompted to add accounts. Enter at least one."
echo

while true; do
  account_count=$((account_count + 1))
  echo "Account #${account_count}:"
  read -p "  Name (e.g., 'Main Bank Account'): " acc_name
  [ -z "$acc_name" ] && break

  read -p "  Woob account ID: " woob_acc_id
  read -p "  Actual Budget ID (sync ID): " actual_budget_id
  read -p "  Actual Account ID: " actual_acc_id
  read -p "  Enabled (yes/no) [yes]: " enabled_input
  enabled_input="${enabled_input:-yes}"

  # Convert to boolean
  if [ "$enabled_input" = "yes" ] || [ "$enabled_input" = "y" ]; then
    enabled="true"
  else
    enabled="false"
  fi

  # Create account object
  account="{
    \"name\": \"$acc_name\",
    \"woob_account_id\": \"$woob_acc_id\",
    \"actual_budget_id\": \"$actual_budget_id\",
    \"actual_account_id\": \"$actual_acc_id\",
    \"enabled\": $enabled
  }"

  accounts+=("$account")
  echo
  read -p "Add another account? (yes/no) [no]: " another
  [ "$another" != "yes" ] && [ "$another" != "y" ] && break
  echo
done

# Validate that at least one account was added
if [ ${#accounts[@]} -eq 0 ]; then
  error "At least one account is required."
  exit 1
fi

# Step 5: Generate config.json
info "Generating config.json..."

# Build the accounts array for JSON
accounts_json="["
for i in "${!accounts[@]}"; do
  accounts_json="${accounts_json}${accounts[$i]}"
  if [ $((i + 1)) -lt ${#accounts[@]} ]; then
    accounts_json="${accounts_json},"
  fi
done
accounts_json="${accounts_json}]"

# Determine encryption password (null if empty)
if [ -z "$encryption_password" ]; then
  encryption_json="null"
else
  encryption_json="\"$encryption_password\""
fi

# Generate the complete config.json
config_json=$(cat <<EOF
{
  "sync_mode": "$sync_mode",
  "cron_schedule": "$cron_schedule",
  "actual_server_url": "$actual_url",
  "actual_password": "$actual_password",
  "actual_encryption_password": $encryption_json,
  "woob_history_count": $woob_history_count,
  "accounts": $accounts_json
}
EOF
)

# Write config.json to project root
config_file="./config.json"
echo "$config_json" > "$config_file"

success "✓ config.json created successfully"
echo
echo "Configuration saved to: $config_file"
echo
echo "Next steps:"
echo "1. Review the config.json file"
echo "2. Start the container: docker compose up -d --build"
echo "3. Check logs: docker compose logs -f"
echo
success "Setup complete!"

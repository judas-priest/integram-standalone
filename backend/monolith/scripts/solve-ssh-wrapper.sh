#!/bin/bash
################################################################################
# Solve SSH Wrapper Script
# Issue #2302 - Execute solve command via SSH and keep script running while
# solve is running
#
# This script:
# 1. Connects to remote server via SSH
# 2. Runs solve command as hive user
# 3. Keeps running while solve is running
# 4. Exits when solve completes
#
# Usage: solve-ssh-wrapper.sh <issue_url>
#
# Exit codes:
#   0 - Solve completed successfully
#   1 - Invalid arguments or connection error
#   Other - Solve command exit code
################################################################################

set -euo pipefail

# Configuration
ISSUE_URL="${1:-}"

if [ $# -eq 0 ]; then
    echo "Usage: $0 <url>" >&2
    exit 1
fi

URL=$1

# Execute SSH command with proper escaping
# The command runs solve in an interactive bash shell (-i) so that
# the hive user's environment is properly loaded
ssh root@YOUR_DEV_SERVER_IP "su - hive -c 'bash -i -c \"solve $URL\"'"

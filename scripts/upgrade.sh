#!/bin/bash
# Upgrade OpenClaw to the latest version
# Data in ./data/ is preserved - only the application image is rebuilt

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "=== OpenClaw Upgrade ==="
echo ""

# Show current version
echo "Current version:"
docker compose exec openclaw-gateway node dist/index.js --version 2>/dev/null || echo "  (gateway not running)"
echo ""

# Rebuild image from latest
echo "Building latest image (this may take a few minutes)..."
docker compose build --no-cache

# Restart gateway
echo ""
echo "Restarting gateway..."
docker compose down
docker compose up -d openclaw-gateway

# Clean up old openclaw images only
echo ""
echo "Cleaning up old openclaw images..."
docker images --filter "dangling=true" --filter "label=com.docker.compose.project=openclaw_profile" -q | xargs -r docker rmi 2>/dev/null || true

# Show new version
echo ""
echo "New version:"
docker compose exec openclaw-gateway node dist/index.js --version
echo ""
echo "=== Upgrade complete ==="

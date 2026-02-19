#!/bin/bash
# Upgrade OpenClaw to the latest version
# Data in ./data/ is preserved - only the application image is rebuilt
# Only touches openclaw_setup resources; other containers/images are left alone

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

export COMPOSE_PROJECT_NAME=openclaw_setup

echo "=== OpenClaw Upgrade ==="
echo ""

# Show current version
echo "Current version:"
docker compose exec openclaw-gateway node dist/index.js --version 2>/dev/null || echo "  (gateway not running)"
echo ""

# Stop gateway (keeps images for now so build can use cache)
echo "Stopping gateway..."
docker compose down

# Rebuild images from latest (--no-cache needed because source is a remote GitHub repo)
echo ""
echo "Building latest image (this may take a few minutes)..."
docker compose build --no-cache openclaw-cli
docker compose build --no-cache openclaw-gateway

# Clean up old images/cache to free disk space (only openclaw_setup resources)
echo ""
echo "Cleaning up old images and cache..."
old_images=$(docker images -q --filter "label=project=openclaw_setup" --filter "dangling=true")
if [ -n "$old_images" ]; then
    docker rmi -f $old_images || true
fi
docker builder prune -f --filter label=project=openclaw_setup

# Start gateway
echo ""
echo "Starting gateway..."
docker compose up -d openclaw-gateway

# Show new version
echo ""
echo "New version:"
docker compose exec openclaw-gateway node dist/index.js --version
echo ""
echo "=== Upgrade complete ==="

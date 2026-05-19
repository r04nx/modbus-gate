#!/bin/bash
set -e

# Configuration
REMOTE_USER="root"
REMOTE_HOST="100.120.145.20"
REMOTE_PASS="root"
REMOTE_PATH="/root/modbus-gate"
PROJECT_ROOT=$(pwd)

export SSHPASS="$REMOTE_PASS"

echo "🚀 Starting Unified Deployment..."

# 1. Frontend Build
echo "📦 Building Frontend..."
cd "$PROJECT_ROOT/frontend"
npm install
npm run build

# 2. Sync Frontend to Backend
echo "🔄 Syncing Frontend to Backend..."
rm -rf "$PROJECT_ROOT/backend/static"
mkdir -p "$PROJECT_ROOT/backend/static"
cp -r "$PROJECT_ROOT/frontend/dist"/* "$PROJECT_ROOT/backend/static/"

# 3. Deploy to Remote via TAR Streaming
echo "📤 Deploying to $REMOTE_HOST (via TAR stream)..."
cd "$PROJECT_ROOT"

# Use tar to stream files to remote host. 
# This pipelines compression -> ssh -> decompression, avoiding temporary files on the remote.
tar czf - \
    --exclude='.git' \
    --exclude='__pycache__' \
    --exclude='.venv' \
    --exclude='venv' \
    --exclude='node_modules' \
    --exclude='frontend' \
    --exclude='deploy_pkg' \
    --exclude='Papers' \
    --exclude='*.db' \
    ./backend/ | sshpass -e ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "tar xzf - -C $REMOTE_PATH"

# 4. Restart Service
echo "🔄 Restarting Service..."
sshpass -e ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "systemctl daemon-reload && systemctl restart vistaiot.service"

echo "✅ Deployment Complete!"

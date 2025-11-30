#!/bin/bash

# Configuration
TARGET_IP="10.0.0.1"
TARGET_USER="vista"
TARGET_PASS="vista"
TARGET_DIR="/home/vista/modbus-gate"
LOCAL_DIR="/home/rohan/Public/warp/modbus-gate"

echo "🚀 Starting deployment to $TARGET_IP..."

# 1. Build Frontend locally
echo "📦 Building frontend..."
cd $LOCAL_DIR/frontend
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed"
    exit 1
fi
cd $LOCAL_DIR

# 2. Create remote directory
echo "📂 Creating remote directory..."
sshpass -p "$TARGET_PASS" ssh -o StrictHostKeyChecking=no $TARGET_USER@$TARGET_IP "mkdir -p $TARGET_DIR"

# 3. Transfer files (excluding heavy/generated folders)
echo "cw Transferring files (using scp)..."
# Create a temporary tarball to exclude files and transfer efficiently
echo "📦 Creating tarball..."
tar --exclude='node_modules' \
    --exclude='venv' \
    --exclude='.git' \
    --exclude='__pycache__' \
    --exclude='*.db' \
    --exclude='buffered_data' \
    -czf /tmp/modbus-gate-deploy.tar.gz .

echo "📤 Uploading tarball..."
sshpass -p "$TARGET_PASS" scp /tmp/modbus-gate-deploy.tar.gz $TARGET_USER@$TARGET_IP:$TARGET_DIR/

echo "📦 Extracting tarball..."
sshpass -p "$TARGET_PASS" ssh $TARGET_USER@$TARGET_IP "cd $TARGET_DIR && tar -xzf modbus-gate-deploy.tar.gz && rm modbus-gate-deploy.tar.gz"

# Clean up local tarball
rm /tmp/modbus-gate-deploy.tar.gz

# 4. Run setup script on remote
echo "⚙️  Running setup script on remote device..."
sshpass -p "$TARGET_PASS" ssh $TARGET_USER@$TARGET_IP "cd $TARGET_DIR && echo '$TARGET_PASS' | sudo -S ./setup.sh --production --no-system"

echo "✅ Deployment completed!"

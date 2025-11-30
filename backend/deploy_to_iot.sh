#!/bin/bash
set -e

REMOTE_HOST="192.168.50.22"
REMOTE_USER="root"
REMOTE_PASS="root"
REMOTE_DIR="/opt/vistaiot"

echo "Deploying to $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR"

# 1. Create remote directory
echo "Creating remote directory..."
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "mkdir -p $REMOTE_DIR"

# 2. Transfer files (excluding venv, __pycache__, .git, etc.)
echo "Transferring files..."
# Using rsync if available would be better, but scp is standard. 
# To exclude files with scp is hard, so we'll use tar pipe.
tar --exclude='venv' --exclude='__pycache__' --exclude='*.pyc' --exclude='.git' --exclude='node_modules' -czf - . | \
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "tar -xzf - -C $REMOTE_DIR"

# 3. Run setup script on remote
echo "Running remote setup script..."
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "chmod +x $REMOTE_DIR/setup_remote.sh && $REMOTE_DIR/setup_remote.sh"

echo "Deployment Finished!"

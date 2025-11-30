#!/bin/bash
set -e

# Configuration
REMOTE_USER="root"
REMOTE_PASS="root"
REMOTE_HOST="192.168.50.22"
REMOTE_DIR="/opt/modbus-gate"

echo "1. Building Frontend..."
cd frontend
# npm install # Uncomment if dependencies might have changed
npm run build
cd ..

echo "2. Stopping remote services..."
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "systemctl stop modbus-gate-backend modbus-gate-frontend" || echo "Services might not be running, continuing..."

echo "3. Packaging Backend..."
# Exclude unnecessary files
tar --exclude='vistaiot.db' \
    --exclude='__pycache__' \
    --exclude='logs' \
    --exclude='venv' \
    --exclude='.git' \
    --exclude='*.pyc' \
    -czf backend.tar.gz backend/

echo "4. Packaging Frontend..."
# Tar the dist folder content
tar -czf frontend.tar.gz -C frontend/dist .

echo "5. Transferring files..."
sshpass -p "$REMOTE_PASS" scp -o StrictHostKeyChecking=no backend.tar.gz frontend.tar.gz $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/

echo "6. Extracting on remote..."
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "cd $REMOTE_DIR && \
    tar -xzf backend.tar.gz && \
    mkdir -p frontend && \
    tar -xzf frontend.tar.gz -C frontend && \
    rm backend.tar.gz frontend.tar.gz"

echo "7. Installing Services..."
# Copy service files from local to remote (assuming they are in the root of the repo)
sshpass -p "$REMOTE_PASS" scp -o StrictHostKeyChecking=no vistaiot-gateway.service vistaiot-frontend.service $REMOTE_USER@$REMOTE_HOST:/etc/systemd/system/
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "systemctl daemon-reload"

echo "8. Initializing Database..."
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "cd $REMOTE_DIR/backend && ./venv/bin/python init_settings_db.py"

echo "9. Starting remote services..."
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "systemctl restart modbus-gate-backend modbus-gate-frontend"

echo "10. Verifying Backend Status..."
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "systemctl status modbus-gate-backend --no-pager"

echo "11. Cleanup local artifacts..."
rm backend.tar.gz frontend.tar.gz

echo "Deployment Complete!"

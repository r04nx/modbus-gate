#!/bin/bash
set -e

REMOTE_HOST="10.10.217.107"
REMOTE_USER="root"
REMOTE_PASS="root"
REMOTE_DIR="/root/modbus-gate"

echo "🚀 Starting Unified Deployment to $REMOTE_HOST..."

# 1. Build Frontend
echo "📦 Building Frontend..."
cd frontend
npm install
npm run build
cd ..

# 2. Prepare Deployment Package
echo "📦 Preparing Deployment Package..."
rm -rf deploy_pkg
mkdir -p deploy_pkg/backend/static

# Copy Backend Code
cp -r backend/app deploy_pkg/backend/
cp backend/main.py deploy_pkg/backend/
cp backend/requirements.txt deploy_pkg/backend/
cp backend/test_import.py deploy_pkg/backend/

# Copy Frontend Build to Backend Static
cp -r frontend/dist/* deploy_pkg/backend/static/

# Copy Service File
cp vistaiot.service deploy_pkg/
cp start_unified.sh deploy_pkg/backend/
chmod +x deploy_pkg/backend/start_unified.sh

# Compile to PYC (Simple compilation)
echo "🔨 Compiling to PYC..."
python3 -m compileall deploy_pkg/backend/app
python3 -m compileall deploy_pkg/backend/main.py

# 3. Deploy to Remote
echo "🚚 Transferring files to $REMOTE_HOST..."

# Install sshpass if not present
if ! command -v sshpass &> /dev/null; then
    echo "Installing sshpass..."
    sudo apt-get update && sudo apt-get install -y sshpass
fi

# Stop existing service
echo "🛑 Stopping existing services..."
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "systemctl stop vistaiot || true; systemctl stop vistaiot-frontend || true; systemctl stop vistaiot-backend || true"

# Create remote directory
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "mkdir -p $REMOTE_DIR"

# Sync files
echo "🔄 Syncing files..."
sshpass -p "$REMOTE_PASS" scp -r -o StrictHostKeyChecking=no deploy_pkg/* $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/

# 4. Remote Setup
echo "🔧 Running Remote Setup..."
sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no $REMOTE_USER@$REMOTE_HOST "bash -s" << EOF
    set -e
    cd $REMOTE_DIR/backend

    # Install Python dependencies
    if [ ! -d "venv" ]; then
        python3 -m venv venv
    fi
    source venv/bin/activate
    pip install -r requirements.txt
    pip install sqlite-web

    # Install Service
    cd $REMOTE_DIR
    cp vistaiot.service /etc/systemd/system/
    chmod +x backend/start_unified.sh
    systemctl daemon-reload
    systemctl enable vistaiot
    systemctl restart vistaiot

    # Cleanup old services
    rm -f /etc/systemd/system/vistaiot-frontend.service
    rm -f /etc/systemd/system/vistaiot-backend.service
    systemctl daemon-reload
    systemctl reset-failed

    echo "✅ Remote Setup Complete"
EOF

echo "🎉 Deployment Complete!"

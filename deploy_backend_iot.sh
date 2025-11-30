#!/bin/bash

# Configuration
TARGET_IP="10.0.0.1"
TARGET_USER="vista"
TARGET_PASS="vista"
TARGET_DIR="/home/vista/modbus-gate"
LOCAL_DIR="/home/rohan/Public/warp/modbus-gate"

echo "🚀 Starting IoT Backend Deployment to $TARGET_IP..."

# 1. Create remote directory
echo "📂 Creating remote directory..."
sshpass -p "$TARGET_PASS" ssh -o StrictHostKeyChecking=no $TARGET_USER@$TARGET_IP "mkdir -p $TARGET_DIR/backend"

# 2. Transfer Backend Files
echo "cw Transferring backend files..."
# Create tarball of backend including wheels
tar --exclude='venv' \
    --exclude='__pycache__' \
    --exclude='*.db' \
    --exclude='buffered_data' \
    -czf /tmp/modbus-gate-backend.tar.gz backend

echo "📤 Uploading backend tarball..."
sshpass -p "$TARGET_PASS" scp /tmp/modbus-gate-backend.tar.gz $TARGET_USER@$TARGET_IP:$TARGET_DIR/

echo "📦 Extracting backend..."
sshpass -p "$TARGET_PASS" ssh $TARGET_USER@$TARGET_IP "cd $TARGET_DIR && tar -xzf modbus-gate-backend.tar.gz && rm modbus-gate-backend.tar.gz"

rm /tmp/modbus-gate-backend.tar.gz

# 3. Install Dependencies (Global, No Venv)
echo "📦 Installing dependencies (Global)..."
# Remove typing-extensions from requirements.txt as system version is sufficient and uninstallation fails
sshpass -p "$TARGET_PASS" ssh $TARGET_USER@$TARGET_IP "sed -i '/typing-extensions/d' $TARGET_DIR/backend/requirements.txt"
# Remove typing-extensions wheel to prevent pip from trying to upgrade it
sshpass -p "$TARGET_PASS" ssh $TARGET_USER@$TARGET_IP "rm -f $TARGET_DIR/backend/wheels/typing_extensions-*.whl"

sshpass -p "$TARGET_PASS" ssh $TARGET_USER@$TARGET_IP "echo '$TARGET_PASS' | sudo -S pip3 install --break-system-packages --no-index --find-links $TARGET_DIR/backend/wheels -r $TARGET_DIR/backend/requirements.txt"

# 4. Create Systemd Service (No Venv)
echo "⚙️  Configuring Systemd Service..."

SERVICE_FILE="[Unit]
Description=VistaIOT Gateway Service
After=network.target

[Service]
Type=simple
User=vista
WorkingDirectory=$TARGET_DIR/backend
Environment=\"BUFFER_DIR=$TARGET_DIR/buffered_data\"
ExecStart=/usr/bin/python3 main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
"

echo "$SERVICE_FILE" > vistaiot-gateway-iot.service

echo "📤 Uploading service file..."
sshpass -p "$TARGET_PASS" scp vistaiot-gateway-iot.service $TARGET_USER@$TARGET_IP:/tmp/vistaiot-gateway.service

echo "🔧 Enabling service..."
sshpass -p "$TARGET_PASS" ssh $TARGET_USER@$TARGET_IP "echo '$TARGET_PASS' | sudo -S mv /tmp/vistaiot-gateway.service /etc/systemd/system/vistaiot-gateway.service && sudo systemctl daemon-reload && sudo systemctl enable vistaiot-gateway && sudo systemctl restart vistaiot-gateway"

rm vistaiot-gateway-iot.service

echo "✅ IoT Backend Deployment Completed!"

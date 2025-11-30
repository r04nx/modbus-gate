#!/bin/bash
set -e

APP_DIR="/opt/vistaiot"

echo "Starting Remote Setup in $APP_DIR..."

# 1. Install System Dependencies
echo "Installing system dependencies..."
# Check if apt is available (Debian/Ubuntu)
if command -v apt-get &> /dev/null; then
    apt-get update
    apt-get install -y python3-venv python3-pip
fi

# 2. Create Virtual Environment
if [ ! -d "$APP_DIR/venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$APP_DIR/venv"
fi

# 3. Install Python Dependencies
echo "Installing Python dependencies..."
"$APP_DIR/venv/bin/pip" install --upgrade pip
"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/requirements.txt"
"$APP_DIR/venv/bin/pip" install sqlite-web

# 4. Install Service Files
echo "Installing service files..."
cp "$APP_DIR/vistaiot-backend-remote.service" /etc/systemd/system/vistaiot-backend.service
cp "$APP_DIR/vistaiot-db-viewer-remote.service" /etc/systemd/system/vistaiot-db-viewer.service

# 5. Reload and Start Services
echo "Starting services..."
systemctl daemon-reload
systemctl enable vistaiot-backend.service
systemctl enable vistaiot-db-viewer.service
systemctl restart vistaiot-backend.service
systemctl restart vistaiot-db-viewer.service

echo "Remote deployment complete!"

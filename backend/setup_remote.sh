#!/bin/bash
set -e

APP_DIR=$(pwd)

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

# 5. Configure Network (Persistence Fix)
echo "Configuring network priority..."
# Only modify if connection exists
if nmcli connection show eth1-config &> /dev/null; then
    echo "Setting eth1-config metric to 700..."
    nmcli connection modify eth1-config ipv4.route-metric 700
fi

# Enable Connectivity Check
echo "Enabling connectivity check..."
mkdir -p /etc/NetworkManager/conf.d
echo -e '[connectivity]\nuri=http://nmcheck.gnome.org/check_network_status.txt\ninterval=60' > /etc/NetworkManager/conf.d/20-connectivity.conf
# Reload to apply
systemctl reload NetworkManager || true

# 6. Reload and Start Services
echo "Starting services..."
systemctl daemon-reload
systemctl enable vistaiot-backend.service
systemctl enable vistaiot-db-viewer.service
systemctl restart vistaiot-backend.service
systemctl restart vistaiot-db-viewer.service

echo "Remote deployment complete!"

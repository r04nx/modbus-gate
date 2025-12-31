#!/bin/bash

# 1. Stop existing services (if any)
echo "Stopping existing services..."
sudo systemctl stop vistaiot-backend.service
sudo systemctl stop vistaiot-db-viewer.service

# 2. Copy service files
echo "Installing service files..."
sudo cp services/vistaiot-backend.service /etc/systemd/system/
sudo cp services/vistaiot-db-viewer.service /etc/systemd/system/

# 3. Reload systemd
echo "Reloading systemd..."
sudo systemctl daemon-reload

# 4. Enable and start services
echo "Enabling and starting services..."
sudo systemctl enable vistaiot-backend.service
sudo systemctl enable vistaiot-db-viewer.service
sudo systemctl start vistaiot-backend.service
sudo systemctl start vistaiot-db-viewer.service

echo "Deployment complete! Check status with:"
echo "sudo systemctl status vistaiot-backend.service"
echo "sudo systemctl status vistaiot-db-viewer.service"

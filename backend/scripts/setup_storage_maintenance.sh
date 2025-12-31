#!/bin/bash
set -e

echo "🔧 Setting up Storage Maintenance..."

# 1. Configure Systemd Journal Limits
echo "📝 Configuring journald limits..."
if grep -q "^SystemMaxUse=" /etc/systemd/journald.conf; then
    sed -i "s/^SystemMaxUse=.*/SystemMaxUse=200M/" /etc/systemd/journald.conf
else
    # If commented out or missing
    sed -i "s/^#SystemMaxUse=.*/SystemMaxUse=200M/" /etc/systemd/journald.conf || echo "SystemMaxUse=200M" >> /etc/systemd/journald.conf
fi
systemctl restart systemd-journald

# 2. Install Cleanup Script
echo "📜 Installing cleanup script..."
cp /root/modbus-gate/backend/scripts/check_and_clean.sh /usr/local/bin/vistaiot-cleanup
chmod +x /usr/local/bin/vistaiot-cleanup

# 3. Create Systemd Service
echo "⚙️ Creating systemd service..."
cat > /etc/systemd/system/vistaiot-cleanup.service <<EOF
[Unit]
Description=VistaIOT Disk Space Cleanup
After=local-fs.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/vistaiot-cleanup 80
User=root
EOF

# 4. Create Systemd Timer
echo "⏰ Creating systemd timer..."
cat > /etc/systemd/system/vistaiot-cleanup.timer <<EOF
[Unit]
Description=Periodic Disk Space Cleanup Check

[Timer]
OnBootSec=15min
OnUnitActiveSec=1h
Unit=vistaiot-cleanup.service

[Install]
WantedBy=timers.target
EOF

# 5. Enable and Start
echo "🚀 Enabling maintenance timer..."
systemctl daemon-reload
systemctl enable vistaiot-cleanup.timer
systemctl start vistaiot-cleanup.timer
systemctl start vistaiot-cleanup.service # Run once immediately

echo "✅ Storage Maintenance Setup Complete!"

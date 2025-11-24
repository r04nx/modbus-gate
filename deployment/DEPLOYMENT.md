# Modbus Gateway Deployment Guide

## System Requirements
- Linux server (tested on Ubuntu/Debian)
- Python 3.8+
- Node.js 18+
- systemd

## Backend Deployment

### 1. Install Dependencies
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Database
The application will automatically create the SQLite database on first run.

### 3. Install Systemd Service
```bash
sudo cp deployment/systemd/modbus-gate-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable modbus-gate-backend
sudo systemctl start modbus-gate-backend
```

### 4. Check Status
```bash
sudo systemctl status modbus-gate-backend
sudo journalctl -u modbus-gate-backend -f
```

## Frontend Deployment

### 1. Build Frontend
```bash
cd frontend
npm install
npm run build
```

### 2. Install serve (if not already installed)
```bash
npm install -g serve
```

### 3. Install Systemd Service
```bash
sudo cp deployment/systemd/modbus-gate-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable modbus-gate-frontend
sudo systemctl start modbus-gate-frontend
```

### 4. Check Status
```bash
sudo systemctl status modbus-gate-frontend
sudo journalctl -u modbus-gate-frontend -f
```

## Access the Application

- **Frontend**: http://your-server-ip:3000
- **Backend API**: http://your-server-ip:8000
- **API Docs**: http://your-server-ip:8000/docs

## Default Credentials
- Username: `admin`
- Password: `admin`

**⚠️ Change the default password immediately after first login!**

## Firewall Configuration

If using UFW:
```bash
sudo ufw allow 3000/tcp  # Frontend
sudo ufw allow 8000/tcp  # Backend API
```

## Troubleshooting

### Backend not starting
```bash
# Check logs
sudo journalctl -u modbus-gate-backend -n 50

# Verify Python environment
cd /opt/modbus-gate/backend
source venv/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend not starting
```bash
# Check logs
sudo journalctl -u modbus-gate-frontend -n 50

# Test manually
cd /opt/modbus-gate/frontend
npx serve -s dist -l 3000
```

## Updating the Application

### Backend Update
```bash
sudo systemctl stop modbus-gate-backend
cd /opt/modbus-gate/backend
source venv/bin/activate
git pull  # or copy new files
pip install -r requirements.txt
sudo systemctl start modbus-gate-backend
```

### Frontend Update
```bash
sudo systemctl stop modbus-gate-frontend
cd /opt/modbus-gate/frontend
npm install
npm run build
sudo systemctl start modbus-gate-frontend
```

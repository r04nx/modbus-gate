# VistaIOT Walkthrough

VistaIOT is a comprehensive Modbus gateway and server software with a modern web interface.

## System Components

1.  **Backend (Python/FastAPI)**: Handles Modbus communication, data storage, and API.
2.  **Frontend (React/Vite)**: Provides the user interface for configuration and monitoring.
3.  **Global Data Store**: In-memory store for real-time tag values.
4.  **SQLite Database**: Persists configuration (Devices, Tags).

## How to Run

### 1. Start the Backend

```bash
cd backend
# Install dependencies (if not already done)
pip install -r requirements.txt
# Run the server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Start the Frontend

```bash
cd frontend
# Install dependencies (if not already done)
npm install
# Run the dev server
npm run dev
```

Access the dashboard at `http://localhost:5173`.

## Features

### Dashboard
- View real-time system metrics (CPU, RAM, Disk, Uptime).
- These are automatically collected by the backend `SystemTagService`.

### Device Management
- Go to the **Devices** page.
- Click **Add Device**.
- Select **Modbus TCP**, **Modbus RTU**, **OPC UA**, or **SNMP**.
- Enter connection details:
    - **Modbus**: IP/Port or Serial Port/Baudrate.
    - **OPC UA**: Endpoint URL (e.g., `opc.tcp://localhost:4840`).
    - **SNMP**: Host, Port, and Community String.
- The `PollingEngine` will automatically start polling enabled devices.
- **Control & Diagnostics**:
    - **Enable/Disable**: Toggle devices on/off directly from the card.
    - **Test Connection**: Click the "Activity" icon to verify connectivity. A modal will show detailed progress and error codes.

### SNMP Simulation
- A Docker-based SNMP simulator is included for testing.
- Run `docker run -d -p 161:161/udp -v $(pwd)/snmp_data:/usr/local/snmpsim/data tandrup/snmpsim` to start it.
- It serves data from `snmp_data/public.snmprec` using community string `public`.

### Tag Management
- Go to the **Tags** page.
- Click **Add Tag**.
- **IO Tags**: Map to a device and register address.
- **User Tags**: Virtual tags for manual input or storage.
- **Calculation Tags**: Define formulas using other tags (e.g., `TAG_A * 0.1`).

### Modbus Server (Slave)
- The backend runs a Modbus TCP Server on port `5020` (default).
- External Modbus clients can connect to this port to read data.
- Data is synced from the Global Data Store to the Modbus Server registers.

## Architecture

- **GlobalDataStore**: Thread-safe singleton for real-time data.
- **PollingEngine**: Async service that polls devices.
- **ModbusServerService**: Async service that runs the Modbus Slave.
- **CalculationEngine**: Async service that evaluates formulas.

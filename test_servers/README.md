# Test Servers for VistaIOT

This directory contains test servers for protocol testing.

## OPC UA Test Server

### Installation
```bash
pip install opcua
```

### Running the Server
```bash
python3 opcua_server.py
```

The server will start on `opc.tcp://localhost:4840/freeopcua/server/`

### Available Test Variables
- **Temperature**: Simulated temperature (20-30°C)
- **Pressure**: Simulated pressure (99-103 kPa)
- **Humidity**: Simulated humidity (40-60%)
- **Status**: Boolean status
- **Counter**: Incrementing counter

### Connecting from VistaIOT
1. Create an OPC UA device with:
   - **Type**: OPC_UA
   - **URL**: `opc.tcp://localhost:4840/freeopcua/server/`
2. Create tags with node IDs:
   - Temperature: `ns=2;i=2`
   - Pressure: `ns=2;i=3`
   - Humidity: `ns=2;i=4`

## IEC104 Testing

IEC104 requires specialized hardware or simulators. For testing:

### Option 1: Disable IEC104 Device
Disable the IEC104 device in VistaIOT to stop error messages.

### Option 2: Use lib60870 Test Server
```bash
# Install lib60870
git clone https://github.com/mz-automation/lib60870.git
cd lib60870/lib60870-C
make
cd examples/cs104_server
make
./cs104_server
```

### Option 3: Use Commercial Simulator
- FreyrSCADA IEC 60870-5-104 Server Simulator
- Triangle MicroWorks IEC 60870-5 Test Harness

## Modbus TCP Server

Already running in Docker container on port 502.

## SNMP Agent

Already running in Docker container on port 161/udp.

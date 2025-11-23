import asyncio
import json
import urllib.request
import urllib.error
from pymodbus.client import AsyncModbusTcpClient

API_URL = "http://localhost:8000/api/v1"
MODBUS_HOST = "localhost"
MODBUS_PORT = 5020

def api_request(method, endpoint, data=None):
    url = f"{API_URL}{endpoint}"
    req = urllib.request.Request(url, method=method)
    req.add_header('Content-Type', 'application/json')
    
    if data:
        json_data = json.dumps(data).encode('utf-8')
        req.data = json_data
        
    try:
        with urllib.request.urlopen(req) as response:
            return response.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.read().decode('utf-8')}")
        raise

async def verify_mapping():
    # 1. Create a Test Tag
    print("Creating test tag...")
    tag_id = "TEST_MAPPING_TAG"
    try:
        api_request("POST", "/tags/", {
            "tag_id": tag_id,
            "name": "Test Mapping Tag",
            "type": "USER",
            "data_type": "INT16",
            "initial_value": "123"
        })
    except Exception:
        print("Tag might already exist, continuing...")

    # 2. Configure Modbus Server with Mapping
    print("Configuring Modbus Server...")
    config = {
        "enabled": True,
        "config": {
            "port": MODBUS_PORT,
            "slave_id": 1,
            "mappings": [
                {
                    "tag_id": tag_id,
                    "register_type": "HR",
                    "address": 10,
                    "data_type": "INT16",
                    "unit_id": 1
                }
            ]
        }
    }
    try:
        api_request("PUT", "/servers/MODBUS_SERVER", config)
    except Exception as e:
        print(f"Failed to update config: {e}")
        return

    # 3. Write Value to Tag
    print("Writing value 999 to tag...")
    try:
        api_request("POST", f"/tags/{tag_id}/write", {"value": "999"})
    except Exception as e:
        print(f"Failed to write tag: {e}")
        return
    
    # Give server time to sync
    await asyncio.sleep(2)

    # 4. Read Modbus Register
    print(f"Reading Holding Register 10 from {MODBUS_HOST}:{MODBUS_PORT}...")
    client = AsyncModbusTcpClient(MODBUS_HOST, port=MODBUS_PORT)
    await client.connect()
    
    if not client.connected:
        print("Failed to connect to Modbus Server")
        return

    # Read Holding Register 10
    # Note: pymodbus read_holding_registers address is 0-based or 1-based depending on implementation?
    # Usually on wire it's address-1. But client library handles it.
    # If we mapped to 10, we expect to read from 10.
    rr = await client.read_holding_registers(10, 1, slave=1)
    if rr.isError():
        print(f"Modbus Read Error: {rr}")
    else:
        val = rr.registers[0]
        print(f"Read Value: {val}")
        if val == 999:
            print("SUCCESS: Value matches!")
        else:
            print(f"FAILURE: Expected 999, got {val}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(verify_mapping())

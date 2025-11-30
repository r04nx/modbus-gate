import requests
import json
import time

BASE_URL = "http://localhost:8000/api/v1"

def create_device(name, type, params):
    # Check if exists
    try:
        res = requests.get(f"{BASE_URL}/devices/")
        if res.status_code == 200:
            for d in res.json():
                if d['name'] == name:
                    print(f"Device {name} already exists (ID: {d['id']})")
                    return d['id']
    except Exception as e:
        print(f"Error checking device existence: {e}")

    payload = {
        "name": name,
        "type": type,
        "connection_params": params,
        "enabled": True,
        "polling_interval": 1000
    }
    try:
        response = requests.post(f"{BASE_URL}/devices/", json=payload)
        response.raise_for_status()
        print(f"Created Device: {name} (ID: {response.json()['id']})")
        return response.json()['id']
    except requests.exceptions.RequestException as e:
        print(f"Error creating device {name}: {e}")
        if response.content:
            print(response.content)
        return None

def create_tag(tag_id, name, type, device_id=None, address=None, data_type=None, params=None, fallback_type="none", fallback_value=""):
    payload = {
        "tag_id": tag_id,
        "name": name,
        "type": type,
        "enabled": True,
        "fallback_type": fallback_type,
        "fallback_value": fallback_value
    }
    
    if type == "IO":
        payload["device_id"] = device_id
        payload["address"] = address
        payload["data_type"] = data_type
        payload["params"] = params or {}
    elif type == "USER":
        payload["initial_value"] = "0"
    elif type == "CALCULATION":
        payload["calculation_formula"] = params # params arg used for formula here
        
    try:
        response = requests.post(f"{BASE_URL}/tags/", json=payload)
        if response.status_code == 400 and "already exists" in response.text:
             print(f"Tag {name} ({tag_id}) already exists")
             return
        response.raise_for_status()
        print(f"Created Tag: {name} (ID: {tag_id})")
    except requests.exceptions.RequestException as e:
        print(f"Error creating tag {name}: {e}")

def main():
    # 1. Create Devices
    modbus_dev_id = create_device("Modbus PLC 1", "MODBUS_TCP", {"host": "192.168.1.100", "port": 502, "slave_id": 1})
    iec_dev_id = create_device("IEC104 RTU 1", "IEC104", {"host": "192.168.1.101", "port": 2404, "common_address": 1})
    
    if not modbus_dev_id or not iec_dev_id:
        print("Failed to create/find devices. Exiting.")
        return

    # 2. Create User Tags
    create_tag("USER_TAG_1", "User Setpoint 1", "USER")
    create_tag("USER_TAG_2", "User Setpoint 2", "USER")

    # 3. Create IO Tags (15 total)
    # Modbus Tags (10)
    for i in range(1, 11):
        create_tag(
            tag_id=f"MB_TAG_{i}",
            name=f"Modbus Register {i}",
            type="IO",
            device_id=modbus_dev_id,
            address=str(40000 + i),
            data_type="INT16",
            params={"register_type": "HOLDING", "byte_order": "ABCD"},
            fallback_type="default" if i % 2 == 0 else "last_success",
            fallback_value="0" if i % 2 == 0 else ""
        )

    # IEC104 Tags (5)
    for i in range(1, 6):
        create_tag(
            tag_id=f"IEC_TAG_{i}",
            name=f"IEC Point {i}",
            type="IO",
            device_id=iec_dev_id,
            address=str(100 + i),
            data_type="FLOAT32",
            params={
                "type_id": "M_ME_NC_1",
                "base_value": 0,
                "soe": True
            },
            fallback_type="none"
        )

    # 4. Create System Tags (Calculation)
    create_tag("SYS_CPU", "System CPU Usage", "CALCULATION", params="RANDOM(0, 100)")
    create_tag("SYS_MEM", "System Memory Usage", "CALCULATION", params="RANDOM(20, 80)")

    # 5. Configure Server Mappings
    print("Configuring Server Mappings...")
    try:
        # Fetch all tags to get IDs
        tags_res = requests.get(f"{BASE_URL}/tags/")
        tags_res.raise_for_status()
        all_tags = tags_res.json()
        
        # Modbus Server Mappings
        modbus_mappings = []
        
        # Map User Tags (Holding Registers 100+)
        user_tags = [t for t in all_tags if t['type'] == 'USER']
        for i, tag in enumerate(user_tags):
            modbus_mappings.append({
                "tag_id": tag['tag_id'],
                "slave_id": 1,
                "register_type": "HOLDING",
                "address": 100 + i,
                "data_type": "INT16"
            })
            
        # Map IO Tags (Holding Registers 200+)
        io_tags = [t for t in all_tags if t['type'] == 'IO']
        for i, tag in enumerate(io_tags):
            modbus_mappings.append({
                "tag_id": tag['tag_id'],
                "slave_id": 1,
                "register_type": "HOLDING",
                "address": 200 + i,
                "data_type": tag.get('data_type', 'INT16')
            })
            
        # Map System Tags (Holding Registers 300+)
        sys_tags = [t for t in all_tags if t['type'] == 'CALCULATION']
        for i, tag in enumerate(sys_tags):
            modbus_mappings.append({
                "tag_id": tag['tag_id'],
                "slave_id": 1,
                "register_type": "HOLDING",
                "address": 300 + i,
                "data_type": "FLOAT32"
            })
            
        # Update Modbus Server
        modbus_config = {
            "enabled": True,
            "config": {
                "slave_id": 1,
                "mappings": modbus_mappings
            }
        }
        requests.put(f"{BASE_URL}/servers/MODBUS_SERVER", json=modbus_config).raise_for_status()
        print(f"Configured Modbus Server with {len(modbus_mappings)} mappings")

        # IEC104 Server Mappings
        iec_mappings = []
        # Map some IO tags to IEC104
        for i, tag in enumerate(io_tags[:5]): # First 5 IO tags
            iec_mappings.append({
                "tag_id": tag['tag_id'],
                "ioa": 1000 + i,
                "type_id": "M_ME_NC_1"
            })
            
        # Update IEC104 Server
        iec_config = {
            "enabled": True,
            "config": {
                "mappings": iec_mappings
            }
        }
        requests.put(f"{BASE_URL}/servers/IEC104_SERVER", json=iec_config).raise_for_status()
        print(f"Configured IEC104 Server with {len(iec_mappings)} mappings")

    except Exception as e:
        print(f"Error configuring servers: {e}")

if __name__ == "__main__":
    main()

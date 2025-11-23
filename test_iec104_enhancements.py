#!/usr/bin/env python3
"""
Test script for IEC 104 enhancements including:
- Creating tags with bit manipulation
- Creating tags with span scaling
- Verifying the IEC 104 server serves the data correctly
"""

import requests
import time
import json

BASE_URL = "http://localhost:8000"

def create_device():
    """Create a dummy Modbus device for testing"""
    print("\n=== Creating Test Modbus Device ===")
    device_data = {
        "name": "IEC104_Test_Device",
        "type": "MODBUS_TCP",
        "config": {
            "host": "127.0.0.1",
            "port": 5020
        },
        "enabled": True
    }
    
    # Check if device already exists
    response = requests.get(f"{BASE_URL}/devices")
    if response.status_code == 200:
        devices_data = response.json()
        # Handle both list and dict responses
        devices = devices_data if isinstance(devices_data, list) else devices_data.get("data", [])
        for device in devices:
            if device.get("name") == "IEC104_Test_Device":
                print(f"✓ Device already exists with ID: {device['id']}")
                return device["id"]
    
    response = requests.post(f"{BASE_URL}/devices", json=device_data)
    if response.status_code == 200:
        device_id = response.json()["id"]
        print(f"✓ Created device with ID: {device_id}")
        return device_id
    else:
        print(f"✗ Failed to create device: {response.text}")
        return None

def create_test_tags(device_id):
    """Create test tags with various IEC 104 configurations"""
    print("\n=== Creating Test Tags ===")
    
    tags = [
        {
            "name": "IEC104_Basic_Tag",
            "tag_id": "IEC104_BASIC_001",
            "type": "IO",
            "device_id": device_id,
            "address": "100",
            "data_type": "INT16",
            "params": {
                "register_type": "HOLDING",
                "type_id": "M_ME_NC_1",
                "base_value": 1000
            },
            "enabled": True
        },
        {
            "name": "IEC104_Bit_Extract_Tag",
            "tag_id": "IEC104_BIT_002",
            "type": "IO",
            "device_id": device_id,
            "address": "101",
            "data_type": "INT16",
            "params": {
                "register_type": "HOLDING",
                "type_id": "M_SP_NA_1",
                "base_value": 2000,
                "start_bit": 3,
                "length": 1
            },
            "enabled": True
        },
        {
            "name": "IEC104_Span_Scale_Tag",
            "tag_id": "IEC104_SPAN_003",
            "type": "IO",
            "device_id": device_id,
            "address": "102",
            "data_type": "INT16",
            "params": {
                "register_type": "HOLDING",
                "type_id": "M_ME_NC_1",
                "base_value": 3000,
                "span_low": -50.0,
                "span_high": 150.0
            },
            "enabled": True
        },
        {
            "name": "IEC104_Combined_Tag",
            "tag_id": "IEC104_COMBINED_004",
            "type": "IO",
            "device_id": device_id,
            "address": "103",
            "data_type": "INT16",
            "params": {
                "register_type": "HOLDING",
                "type_id": "M_ME_NC_1",
                "base_value": 4000,
                "start_bit": 8,
                "length": 8,
                "span_low": 0.0,
                "span_high": 255.0,
                "soe": True
            },
            "enabled": True
        }
    ]
    
    created_tags = []
    for tag_data in tags:
        # Check if tag exists
        response = requests.get(f"{BASE_URL}/tags")
        existing_tags = response.json()
        tag_exists = False
        for existing_tag in existing_tags:
            if existing_tag["tag_id"] == tag_data["tag_id"]:
                print(f"✓ Tag {tag_data['tag_id']} already exists")
                created_tags.append(existing_tag)
                tag_exists = True
                break
        
        if not tag_exists:
            response = requests.post(f"{BASE_URL}/tags", json=tag_data)
            if response.status_code == 200:
                created_tag = response.json()
                created_tags.append(created_tag)
                print(f"✓ Created tag: {tag_data['tag_id']}")
            else:
                print(f"✗ Failed to create tag {tag_data['tag_id']}: {response.text}")
    
    return created_tags

def write_test_values(tags):
    """Write test values to the tags"""
    print("\n=== Writing Test Values ===")
    
    test_values = {
        "IEC104_BASIC_001": 12345,
        "IEC104_BIT_002": 0b1010110011001100,  # Bit 3 = 1
        "IEC104_SPAN_003": 32768,  # Should scale to 50.0 (middle of -50 to 150)
        "IEC104_COMBINED_004": 0b1010110011001100  # Upper byte = 0b10101100 = 172
    }
    
    for tag_id, value in test_values.items():
        response = requests.post(f"{BASE_URL}/tags/{tag_id}/write", json={"value": value})
        if response.status_code == 200:
            print(f"✓ Wrote value {value} to {tag_id}")
        else:
            print(f"✗ Failed to write to {tag_id}: {response.text}")

def check_tag_values():
    """Check the current tag values"""
    print("\n=== Checking Tag Values ===")
    
    response = requests.get(f"{BASE_URL}/tags/values")
    if response.status_code == 200:
        values = response.json()
        
        test_tags = ["IEC104_BASIC_001", "IEC104_BIT_002", "IEC104_SPAN_003", "IEC104_COMBINED_004"]
        for tag_id in test_tags:
            if tag_id in values:
                print(f"✓ {tag_id}: {values[tag_id]}")
            else:
                print(f"✗ {tag_id}: No value found")
    else:
        print(f"✗ Failed to get tag values: {response.text}")

def configure_iec104_server(tags):
    """Configure IEC 104 server with tag mappings"""
    print("\n=== Configuring IEC 104 Server ===")
    
    # Get current IEC 104 server config
    response = requests.get(f"{BASE_URL}/servers")
    servers = response.json()
    
    iec104_server = None
    for server in servers:
        if server["type"] == "IEC104_SERVER":
            iec104_server = server
            break
    
    if not iec104_server:
        print("✗ IEC 104 Server not found")
        return
    
    # Create mappings
    mappings = []
    for i, tag in enumerate(tags):
        mappings.append({
            "tag_id": tag["tag_id"],
            "ioa": int(tag["address"]) + int(tag["params"].get("base_value", 0)),
            "type_id": tag["params"].get("type_id", "M_ME_NC_1")
        })
    
    # Update server config
    config = iec104_server["config"]
    config["mappings"] = mappings
    
    update_data = {
        "name": iec104_server["name"],
        "type": iec104_server["type"],
        "config": config,
        "enabled": True
    }
    
    response = requests.put(f"{BASE_URL}/servers/{iec104_server['id']}", json=update_data)
    if response.status_code == 200:
        print(f"✓ Updated IEC 104 server with {len(mappings)} mappings")
        for mapping in mappings:
            print(f"  - {mapping['tag_id']} -> IOA {mapping['ioa']} ({mapping['type_id']})")
    else:
        print(f"✗ Failed to update IEC 104 server: {response.text}")

def main():
    print("=" * 60)
    print("IEC 104 Enhancement Test Script")
    print("=" * 60)
    
    # Step 1: Create device
    device_id = create_device()
    if not device_id:
        print("\n✗ Test failed: Could not create device")
        return
    
    # Step 2: Create test tags
    tags = create_test_tags(device_id)
    if not tags:
        print("\n✗ Test failed: Could not create tags")
        return
    
    # Step 3: Write test values
    write_test_values(tags)
    
    # Wait for values to propagate
    print("\nWaiting 2 seconds for values to propagate...")
    time.sleep(2)
    
    # Step 4: Check tag values
    check_tag_values()
    
    # Step 5: Configure IEC 104 server
    configure_iec104_server(tags)
    
    print("\n" + "=" * 60)
    print("Test Setup Complete!")
    print("=" * 60)
    print("\nNext Steps:")
    print("1. The IEC 104 server should now be serving the test tags")
    print("2. Use an IEC 104 client to connect to port 2404")
    print("3. Verify the following transformations:")
    print("   - IEC104_BASIC_001: Raw value 12345")
    print("   - IEC104_BIT_002: Bit 3 extracted = 1")
    print("   - IEC104_SPAN_003: Scaled to ~50.0 (from 32768)")
    print("   - IEC104_COMBINED_004: Upper byte (172) scaled to ~172.0")
    print("\nTo test with curl, check tag values:")
    print("  curl http://localhost:8000/tags/values")

if __name__ == "__main__":
    main()

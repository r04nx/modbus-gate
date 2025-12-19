import hashlib
import os
import subprocess

# This is the "blessed" hardware ID for the specific device the user wants to lock to.
# I will calculate this based on the values I retrieved and update this file.
# For now, I'll put a placeholder or logic to load it from a file.
# To make it "only run on this device", I can hardcode the hash here after I calculate it.

def get_mac_address():
    try:
        with open('/sys/class/net/eth0/address', 'r') as f:
            return f.read().strip()
    except Exception:
        return None

def get_machine_id():
    try:
        with open('/etc/machine-id', 'r') as f:
            return f.read().strip()
    except Exception:
        return None

def get_hardware_id():
    mac = get_mac_address()
    machine_id = get_machine_id()
    
    if not mac or not machine_id:
        return "UNKNOWN_HARDWARE"
    
    # Combine identifiers
    raw_id = f"{mac}-{machine_id}"
    
    # Create SHA-256 hash
    return hashlib.sha256(raw_id.encode()).hexdigest()

# The valid license key for this specific device.
# MAC: 08:ef:6c:c7:36:58
# Machine ID: 936bf6598f494a68b0c8e50fa5b51cd8
# Raw: 08:ef:6c:c7:36:58-936bf6598f494a68b0c8e50fa5b51cd8
# I will calculate the hash of this string and replace VALID_LICENSE_KEY.
VALID_LICENSE_KEY = "bb59ca636e867905034cc4a1958a383370a674229e859d67e6c057f2d1d3f25e"

def verify_license():
    current_id = get_hardware_id()
    return current_id == VALID_LICENSE_KEY, current_id

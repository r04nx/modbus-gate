#!/usr/bin/env python3
"""
Add System Tags to IEC104 Server Mappings
"""

import requests
import json

API_BASE = "http://192.168.50.22:8000/api/v1"

def main():
    # Get all tags
    print("📥 Fetching tags...")
    tags_resp = requests.get(f"{API_BASE}/tags")
    tags = tags_resp.json()
    
    # Filter system tags
    system_tags = [t for t in tags if t.get('type') == 'SYSTEM' and t.get('enabled')]
    print(f"✅ Found {len(system_tags)} enabled system tags")
    
    # Get current IEC104 config
    print("\n📥 Fetching IEC104 server config...")
    config_resp = requests.get(f"{API_BASE}/servers/IEC104_SERVER")
    config = config_resp.json()
    
    print(f"Current mappings: {len(config['config'].get('mappings', []))}")
    
    # Create mappings for system tags
    mappings = []
    base_value = 1000  # Start IOA at 1000
    
    for idx, tag in enumerate(system_tags[:10]):  # Limit to 10 tags
        tag_id = tag['tag_id']
        data_type = tag.get('data_type', 'FLOAT32')
        
        # Infer type_id
        if 'BOOL' in data_type:
            type_id = 'M_SP_NA_1'  # Single Point
        elif 'FLOAT' in data_type:
            type_id = 'M_ME_NC_1'  # Float
        else:
            type_id = 'M_ME_NB_1'  # Scaled Value
        
        mapping = {
            'tag_id': tag_id,
            'name': tag.get('name', tag_id),
            'data_type': data_type,
            'base_value': base_value,
            'ioa': idx,  # Offset
            'type_id': type_id,
            'soe': False,
            'cot': 'SPONTANEOUS'
        }
        
        mappings.append(mapping)
        computed_ioa = base_value + idx
        print(f"  {tag_id[:30]:<30} → IOA {computed_ioa} ({base_value}+{idx}) | {type_id}")
    
    # Update config
    config['config']['mappings'] = mappings
    config['enabled'] = True
    
    print(f"\n📤 Updating IEC104 server config with {len(mappings)} mappings...")
    update_resp = requests.put(f"{API_BASE}/servers/IEC104_SERVER", json=config)
    
    if update_resp.status_code == 200:
        print("✅ IEC104 server configuration updated successfully!")
        print(f"\n📊 Server Status:")
        print(f"  Enabled: {config['enabled']}")
        print(f"  Port: {config['config'].get('port', 2404)}")
        print(f"  Common Address: {config['config'].get('common_address', 1)}")
        print(f"  Mappings: {len(mappings)}")
    else:
        print(f"❌ Failed to update config: {update_resp.status_code}")
        print(update_resp.text)

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
IEC 60870-5-104 Client Test Script

Tests the enhanced IEC104 server with base_value, SOE, and CoT support.
"""

import c104
import time
import sys

def test_iec104_client(host='192.168.50.22', port=2404, common_address=1):
    """
    Connect to IEC104 server and test point reading
    
    Args:
        host: Server IP address
        port: Server port (default 2404)
        common_address: Common Address (ASDU)
    """
    
    print(f"🔌 Connecting to IEC104 Server at {host}:{port} (CA={common_address})")
    print("=" * 70)
    
    # Track received points
    received_points = {}
    
    def on_receive_point(point, previous_info, message):
        """Callback when a point value is received"""
        ioa = point.io_address
        value = point.value
        quality = point.quality
        timestamp = point.timestamp_ms
        
        # Store point data
        received_points[ioa] = {
            'value': value,
            'quality': quality.name if hasattr(quality, 'name') else str(quality),
            'timestamp': timestamp,
            'type': str(point.type)
        }
        
        print(f"📊 IOA {ioa:5d} | Value: {value:10} | Quality: {quality} | Type: {point.type}")
        return True
    
    def on_new_point(client, station, io_address, point_type):
        """Callback when a new point is discovered"""
        print(f"🆕 Discovered Point: IOA {io_address} | Type: {point_type}")
        # Add the point to the station and register callback
        point = station.add_point(io_address, point_type)
        point.on_receive(on_receive_point)
    
    try:
        # Create client
        client = c104.Client()
        client.on_new_point(on_new_point)
        
        # Add connection
        connection = client.add_connection(ip=host, port=port, init=c104.Init.INTERROGATION)
        
        # Start client
        print("▶️  Starting client...")
        client.start()
        
        # Wait for connection
        print("⏳ Waiting for connection...")
        time.sleep(2)
        
        if not connection.is_connected:
            print("❌ Failed to connect to server")
            return False
        
        print("✅ Connected successfully!")
        print("\n📡 Sending General Interrogation...")
        
        # Send interrogation command
        connection.interrogation(common_address=common_address, cause=c104.Cot.ACTIVATION, qualifier=c104.Qoi.STATION)
        
        # Wait for responses
        print("⏳ Waiting for data (10 seconds)...")
        time.sleep(10)
        
        # Display summary
        print("\n" + "=" * 70)
        print(f"📋 Summary: Received {len(received_points)} points")
        print("=" * 70)
        
        if received_points:
            print(f"\n{'IOA':<10} {'Value':<15} {'Quality':<15} {'Type':<20}")
            print("-" * 70)
            for ioa in sorted(received_points.keys()):
                data = received_points[ioa]
                print(f"{ioa:<10} {str(data['value']):<15} {data['quality']:<15} {data['type']:<20}")
        else:
            print("\n⚠️  No points received. Check server configuration.")
        
        # Stop client
        print("\n🛑 Stopping client...")
        client.stop()
        
        return len(received_points) > 0
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_with_curl(host='192.168.50.22'):
    """Test IEC104 server configuration via REST API"""
    import subprocess
    import json
    
    print("\n" + "=" * 70)
    print("🔍 Checking IEC104 Server Configuration via API")
    print("=" * 70)
    
    try:
        # Get server config
        result = subprocess.run(
            ['curl', '-s', f'http://{host}:8000/api/v1/servers/IEC104_SERVER'],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            config = json.loads(result.stdout)
            
            print(f"\n✅ Server Enabled: {config.get('enabled', False)}")
            print(f"📍 Port: {config['config'].get('port', 2404)}")
            print(f"🏷️  Common Address: {config['config'].get('common_address', 1)}")
            
            mappings = config['config'].get('mappings', [])
            print(f"\n📊 Configured Mappings: {len(mappings)}")
            
            if mappings:
                print(f"\n{'Tag ID':<20} {'Base':<8} {'Offset':<8} {'IOA':<8} {'Type ID':<15} {'SOE':<5} {'CoT':<15}")
                print("-" * 95)
                for m in mappings:
                    base = m.get('base_value', 0)
                    offset = m.get('ioa', 0)
                    computed = base + offset
                    tag_id = m.get('tag_id', 'N/A')[:20]
                    type_id = m.get('type_id', 'N/A')[:15]
                    soe = '✓' if m.get('soe', False) else ''
                    cot = m.get('cot', 'SPONTANEOUS')[:15]
                    
                    print(f"{tag_id:<20} {base:<8} {offset:<8} {computed:<8} {type_id:<15} {soe:<5} {cot:<15}")
            else:
                print("\n⚠️  No mappings configured")
            
            return True
        else:
            print(f"❌ Failed to fetch config: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == '__main__':
    # Parse arguments
    host = sys.argv[1] if len(sys.argv) > 1 else '192.168.50.22'
    
    print("🧪 IEC 60870-5-104 Server Test")
    print("=" * 70)
    
    # Test API first
    api_ok = test_with_curl(host)
    
    if api_ok:
        # Test IEC104 protocol
        print("\n")
        success = test_iec104_client(host)
        
        if success:
            print("\n✅ Test completed successfully!")
            sys.exit(0)
        else:
            print("\n⚠️  Test completed with warnings")
            sys.exit(1)
    else:
        print("\n❌ API test failed - skipping protocol test")
        sys.exit(1)

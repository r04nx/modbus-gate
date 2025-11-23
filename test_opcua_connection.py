#!/usr/bin/env python3
import asyncio
import logging
from asyncua import Client

logging.basicConfig(level=logging.DEBUG)

async def test_opcua_connection():
    url = "opc.tcp://localhost:4840/freeopcua/server/"
    print(f"Testing OPC UA connection to {url}...")
    
    try:
        client = Client(url)
        print("Client created")
        
        print("Connecting...")
        await client.connect()
        print("✓ Connected successfully!")
        
        # Get namespaces
        namespaces = await client.get_namespace_array()
        print(f"✓ Namespaces: {namespaces}")
        
        # Try to read a node
        try:
            # Try to browse the Objects folder
            objects = client.get_objects_node()
            print(f"✓ Objects node: {objects}")
            
            # Browse children
            children = await objects.get_children()
            print(f"✓ Found {len(children)} children under Objects:")
            for child in children:
                browse_name = await child.read_browse_name()
                print(f"  - {browse_name.Name}")
            
            # Try to read the specific node if it exists
            try:
                # ns=2;s=Modbus Holding Register 0
                node = client.get_node("ns=2;s=Modbus Holding Register 0")
                value = await node.read_value()
                print(f"✓ Read node 'ns=2;s=Modbus Holding Register 0': {value}")
            except Exception as e:
                print(f"✗ Could not read specific node: {e}")
                
        except Exception as e:
            print(f"✗ Error browsing/reading nodes: {e}")
            import traceback
            traceback.print_exc()
        
        await client.disconnect()
        print("✓ Disconnected")
        
    except Exception as e:
        print(f"✗ Connection failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_opcua_connection())

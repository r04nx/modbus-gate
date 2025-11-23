#!/usr/bin/env python3
import asyncio
from asyncua import Client

async def test_opcua_nodes():
    url = "opc.tcp://localhost:4840/freeopcua/server/"
    print(f"Testing OPC UA nodes at {url}...\n")
    
    nodes_to_test = [
        ("ns=2;s=Modbus Holding Register 0", "MODBUS_HOLDING_0"),
        ("ns=2;s=rohan20", "ROHAN20"),
        ("ns=2;s=temperature", "TEMPERATURE"),
    ]
    
    try:
        client = Client(url)
        await client.connect()
        print("✓ Connected\n")
        
        # Browse Tags folder
        try:
            tags_folder = client.get_node("ns=2;i=1")  # Tags folder
            children = await tags_folder.get_children()
            print(f"Tags folder has {len(children)} children:")
            for child in children:
                try:
                    browse_name = await child.read_browse_name()
                    node_id = child.nodeid
                    value = await child.read_value()
                    print(f"  - {browse_name.Name} (NodeId: {node_id}): {value}")
                except Exception as e:
                    print(f"  - Error reading child: {e}")
            print()
        except Exception as e:
            print(f"Could not browse Tags folder: {e}\n")
        
        # Test specific nodes
        for node_id, tag_name in nodes_to_test:
            try:
                node = client.get_node(node_id)
                value = await node.read_value()
                print(f"✓ {tag_name}: {value}")
            except Exception as e:
                print(f"✗ {tag_name}: {e}")
        
        await client.disconnect()
        
    except Exception as e:
        print(f"Connection failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_opcua_nodes())

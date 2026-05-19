import asyncio
from asyncua import Client

async def main():
    url = "opc.tcp://100.120.145.20:4840/freeopcua/server/"
    print(f"Connecting to {url} ...")
    
    async with Client(url=url) as client:
        print("Connected!")
        # Find the namespace index
        nsidx = await client.get_namespace_index("http://vistaiot.com")
        print(f"Namespace Index for vistaiot.com: {nsidx}")
        
        tags = [f"Device1:Tag{i}" for i in range(1, 11)]
        
        print("\n--- OPC UA Values ---")
        for tag in tags:
            try:
                node = client.get_node(f"ns={nsidx};s={tag}")
                val = await node.read_value()
                print(f"{tag}: {val}")
            except Exception as e:
                print(f"{tag}: Error reading -> {e}")

if __name__ == "__main__":
    asyncio.run(main())

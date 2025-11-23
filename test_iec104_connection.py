import asyncio
import c104
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)

async def test_connection():
    print("Testing IEC104 Connection to localhost:2404...")
    
    received_data = {}

    def on_receive(point: c104.Point, previous_info: c104.Information, message: c104.IncomingMessage) -> bool:
        print(f"Received data: IOA={point.io_address}, Value={point.value}, Type={point.type}")
        received_data[str(point.io_address)] = point.value
        return True

    def on_new_point(client: c104.Client, station: c104.Station, io_address: int, point_type: c104.Type) -> None:
        print(f"New point discovered: IOA={io_address}, Type={point_type}")
        # We need to add the point to the station to interact with it
        point = station.add_point(io_address, point_type)
        point.on_receive(on_receive)
        return None

    try:
        client = c104.Client()
        client.on_new_point(on_new_point)
        connection = client.add_connection(ip="127.0.0.1", port=2404)
        # connection.set_on_step(on_step) # Removed invalid call
        
        print("Starting client...")
        client.start()
        
        print("Sending interrogation command...")
        connection.interrogation(common_address=1)
        
        print("Waiting for responses...")
        await asyncio.sleep(2)
        
        print(f"Total received points: {len(received_data)}")
        print("Received Data:", received_data)
        
        # client.stop() # c104 doesn't always have stop, let's just exit
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_connection())

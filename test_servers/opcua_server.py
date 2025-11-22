#!/usr/bin/env python3
"""
Simple OPC UA Test Server
Run this to test OPC UA connectivity
"""

from opcua import Server
import time
import random
import logging

logging.basicConfig(level=logging.INFO)

def main():
    # Create server instance
    server = Server()
    server.set_endpoint("opc.tcp://0.0.0.0:4840/freeopcua/server/")
    server.set_server_name("VistaIOT Test OPC UA Server")
    
    # Setup namespace
    uri = "http://vistaiot.test"
    idx = server.register_namespace(uri)
    
    # Get Objects node
    objects = server.get_objects_node()
    
    # Create test device object
    test_device = objects.add_object(idx, "TestDevice")
    
    # Add variables
    temperature = test_device.add_variable(idx, "Temperature", 25.0)
    temperature.set_writable()
    
    pressure = test_device.add_variable(idx, "Pressure", 101.3)
    pressure.set_writable()
    
    humidity = test_device.add_variable(idx, "Humidity", 50.0)
    humidity.set_writable()
    
    status = test_device.add_variable(idx, "Status", True)
    status.set_writable()
    
    counter = test_device.add_variable(idx, "Counter", 0)
    counter.set_writable()
    
    # Start server
    server.start()
    print("=" * 60)
    print("OPC UA Test Server Started")
    print("=" * 60)
    print(f"Endpoint: opc.tcp://localhost:4840/freeopcua/server/")
    print(f"Namespace Index: {idx}")
    print(f"Available Variables:")
    print(f"  - ns={idx};i=2 (Temperature)")
    print(f"  - ns={idx};i=3 (Pressure)")
    print(f"  - ns={idx};i=4 (Humidity)")
    print(f"  - ns={idx};i=5 (Status)")
    print(f"  - ns={idx};i=6 (Counter)")
    print("=" * 60)
    print("Press Ctrl+C to stop")
    print("=" * 60)
    
    try:
        count = 0
        while True:
            time.sleep(2)
            
            # Simulate changing values
            temp_val = 25.0 + random.uniform(-5, 5)
            pressure_val = 101.3 + random.uniform(-2, 2)
            humidity_val = 50.0 + random.uniform(-10, 10)
            
            temperature.set_value(temp_val)
            pressure.set_value(pressure_val)
            humidity.set_value(humidity_val)
            counter.set_value(count)
            
            count += 1
            
            if count % 10 == 0:
                print(f"[{time.strftime('%H:%M:%S')}] Temp: {temp_val:.2f}°C, "
                      f"Pressure: {pressure_val:.2f} kPa, "
                      f"Humidity: {humidity_val:.1f}%, "
                      f"Counter: {count}")
    
    except KeyboardInterrupt:
        print("\nShutting down server...")
    finally:
        server.stop()
        print("Server stopped")

if __name__ == "__main__":
    main()

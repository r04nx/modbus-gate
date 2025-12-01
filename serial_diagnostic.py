#!/usr/bin/env python3
import serial
import time

port = "/dev/ttyAS0"
baudrate = 9600

print(f"Opening {port} at {baudrate} baud...")
print("Listening for any serial activity for 5 seconds...")
print("(This will show if the PLC is sending any data)")
print("-" * 60)

try:
    ser = serial.Serial(
        port=port,
        baudrate=baudrate,
        bytesize=8,
        parity='N',
        stopbits=1,
        timeout=0.1
    )
    
    print(f"✓ Port opened successfully")
    print(f"Waiting for data...")
    
    start_time = time.time()
    data_received = False
    
    while time.time() - start_time < 5:
        if ser.in_waiting > 0:
            data = ser.read(ser.in_waiting)
            print(f"📥 Received {len(data)} bytes: {data.hex()}")
            data_received = True
        time.sleep(0.1)
    
    if not data_received:
        print("\n❌ No data received in 5 seconds")
        print("\nThis means:")
        print("1. PLC is not sending any data")
        print("2. Wiring might be incorrect")
        print("3. PLC might not be powered")
        print("4. Wrong serial port")
    
    ser.close()
    
except Exception as e:
    print(f"❌ Error: {e}")

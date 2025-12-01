#!/usr/bin/env python3
from pymodbus.client import ModbusSerialClient
import struct
import time

port = "/dev/ttyAS0"
baudrate = 9600
slave_id = 181
address = 100  # 40101 - 40001 = 100

print("="*70)
print("MANUAL MODBUS RTU TEST")
print("="*70)
print(f"Port: {port}")
print(f"Baud Rate: {baudrate}")
print(f"Slave ID: {slave_id}")
print(f"Register: 40101 (Offset: {address})")
print("="*70)

# Create client
client = ModbusSerialClient(
    port=port,
    baudrate=baudrate,
    bytesize=8,
    parity='N',
    stopbits=1,
    timeout=3
)

# Connect
if not client.connect():
    print("❌ Failed to open serial port")
    exit(1)

print("✓ Serial port opened successfully")
print("\n🔄 Attempting to read 2 registers from address 100...")
print("   (Watch the RS485 module TX/RX LEDs!)\n")

# Try reading
try:
    result = client.read_holding_registers(address=address, count=2, device_id=slave_id)
    
    if result.isError():
        print(f"❌ Modbus Error: {result}")
        if hasattr(result, 'exception_code'):
            print(f"   Exception Code: {result.exception_code}")
    else:
        print(f"✅ SUCCESS!")
        print(f"   Raw Registers: {result.registers}")
        
        # Decode as float (Big Endian ABCD)
        if len(result.registers) >= 2:
            try:
                packed = struct.pack('>HH', result.registers[0], result.registers[1])
                float_val = struct.unpack('>f', packed)[0]
                print(f"   As Float (ABCD): {float_val:.2f}")
            except Exception as e:
                print(f"   Float decode error: {e}")
        
        # Decode as 32-bit integer
        try:
            int_val = (result.registers[0] << 16) | result.registers[1]
            print(f"   As 32-bit Int: {int_val}")
        except Exception as e:
            print(f"   Int decode error: {e}")

except Exception as e:
    print(f"❌ Exception: {e}")

client.close()
print("\n" + "="*70)
print("Test complete.")
print("="*70)

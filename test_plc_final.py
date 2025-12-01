#!/usr/bin/env python3
from pymodbus.client import ModbusSerialClient
import struct
import time

port = "/dev/ttyAS0"
baudrate = 9600
parity = 'N'
slave_id = 181

print("="*70)
print("PLC CONNECTION TEST - FINAL")
print("="*70)
print(f"Port: {port}")
print(f"Baud Rate: {baudrate}")
print(f"Parity: {parity}")
print(f"Slave ID: {slave_id}")
print("="*70)

# Test multiple common register addresses
test_addresses = [
    (0, "40001 - Common starting address"),
    (100, "40101 - Watts Total"),
    (156, "40157 - Frequency"),
    (600, "40601 - Another common address")
]

client = ModbusSerialClient(
    port=port,
    baudrate=baudrate,
    bytesize=8,
    parity=parity,
    stopbits=1,
    timeout=3
)

if not client.connect():
    print("❌ Failed to open serial port")
    exit(1)

print("✓ Serial port opened successfully")
print("\n🔄 Testing multiple addresses...")
print("   Watch the RS485 module LEDs!\n")

success = False
for addr, description in test_addresses:
    print(f"Testing address {addr} ({description})...", end=" ")
    try:
        result = client.read_holding_registers(address=addr, count=2, device_id=slave_id)
        
        if not result.isError():
            print(f"✅ SUCCESS!")
            print(f"   Raw Registers: {result.registers}")
            
            # Decode as float (Big Endian ABCD)
            if len(result.registers) >= 2:
                try:
                    packed = struct.pack('>HH', result.registers[0], result.registers[1])
                    float_val = struct.unpack('>f', packed)[0]
                    print(f"   As Float (ABCD): {float_val:.2f}")
                except Exception as e:
                    print(f"   Float decode: {e}")
            
            success = True
            break
        else:
            print(f"No response")
    except Exception as e:
        print(f"Error: {e}")
    
    time.sleep(0.5)

client.close()

print("\n" + "="*70)
if success:
    print("✅ ✅ ✅ PLC RESPONDING! ✅ ✅ ✅")
    print("="*70)
    print(f"Working configuration:")
    print(f"  - Port: {port}")
    print(f"  - Baud Rate: {baudrate}")
    print(f"  - Slave ID: {slave_id}")
    print(f"  - Address: {addr}")
else:
    print("❌ NO RESPONSE FROM PLC")
    print("="*70)
    print("\nDid the TX LED (RXD) blink? If YES, the issue is:")
    print("  1. PLC is in STOP/PROGRAM mode (needs RUN mode)")
    print("  2. Modbus RTU disabled on PLC")
    print("  3. Wrong register address")
    print("  4. RS485 A/B polarity reversed")
print("="*70)

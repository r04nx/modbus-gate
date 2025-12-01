#!/usr/bin/env python3
from pymodbus.client import ModbusSerialClient
import struct

# Comprehensive scan
baud_rates = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]
slave_ids = [1, 180, 181, 247]  # Common IDs
addresses = [0, 100, 156]  # Common starting addresses

print("="*70)
print("COMPREHENSIVE MODBUS RTU SCANNER")
print("="*70)
print(f"Testing {len(baud_rates)} baud rates × {len(slave_ids)} slave IDs × {len(addresses)} addresses")
print(f"Total combinations: {len(baud_rates) * len(slave_ids) * len(addresses)}")
print("="*70)

test_count = 0
for baud in baud_rates:
    for slave in slave_ids:
        for addr in addresses:
            test_count += 1
            print(f"\r[{test_count}/{len(baud_rates)*len(slave_ids)*len(addresses)}] Testing: Baud={baud}, Slave={slave}, Addr={addr}...", end="", flush=True)
            
            client = ModbusSerialClient(
                port='/dev/ttyAS0',
                baudrate=baud,
                bytesize=8,
                parity='N',
                stopbits=1,
                timeout=1  # Shorter timeout for faster scanning
            )
            
            if not client.connect():
                continue
            
            try:
                result = client.read_holding_registers(
                    address=addr, 
                    count=2, 
                    device_id=slave
                )
                
                if not result.isError():
                    print(f"\n\n{'='*70}")
                    print(f"✅ ✅ ✅ SUCCESS! ✅ ✅ ✅")
                    print(f"{'='*70}")
                    print(f"Baud Rate: {baud}")
                    print(f"Slave ID: {slave}")
                    print(f"Address: {addr}")
                    print(f"Registers: {result.registers}")
                    if len(result.registers) >= 2:
                        packed = struct.pack('>HH', result.registers[0], result.registers[1])
                        val = struct.unpack('>f', packed)[0]
                        print(f"Float (ABCD): {val:.2f}")
                    print(f"{'='*70}")
                    client.close()
                    exit(0)
            except:
                pass
            
            client.close()

print(f"\n\n{'='*70}")
print("❌ NO WORKING CONFIGURATION FOUND")
print(f"{'='*70}")
print("\nPossible issues:")
print("1. PLC is in STOP/PROGRAM mode (needs to be in RUN mode)")
print("2. PLC Modbus communication is disabled")
print("3. Uncommon baud rate (not in standard list)")
print("4. Different slave ID (not 1, 180, 181, or 247)")
print("5. RS485 A/B polarity reversed (try swapping)")
print(f"{'='*70}")

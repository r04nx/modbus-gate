#!/usr/bin/env python3
from pymodbus.client import ModbusSerialClient
import struct

configs = [
    {"slave": 181, "baud": 9600, "addr": 100},
    {"slave": 180, "baud": 9600, "addr": 100},
    {"slave": 181, "baud": 19200, "addr": 100},
    {"slave": 181, "baud": 9600, "addr": 0},
    {"slave": 181, "baud": 9600, "addr": 156},
]

print("="*70)
print("TESTING MULTIPLE CONFIGURATIONS")
print("="*70)

for i, cfg in enumerate(configs, 1):
    print(f"\nTest {i}/{len(configs)}: Slave={cfg['slave']}, Baud={cfg['baud']}, Addr={cfg['addr']}")
    print("-"*70)
    
    client = ModbusSerialClient(
        port='/dev/ttyAS0',
        baudrate=cfg['baud'],
        bytesize=8,
        parity='N',
        stopbits=1,
        timeout=2
    )
    
    if not client.connect():
        print("❌ Failed to connect")
        continue
    
    try:
        result = client.read_holding_registers(
            address=cfg['addr'], 
            count=2, 
            device_id=cfg['slave']
        )
        
        if not result.isError():
            print(f"✅ SUCCESS! Registers: {result.registers}")
            if len(result.registers) >= 2:
                packed = struct.pack('>HH', result.registers[0], result.registers[1])
                val = struct.unpack('>f', packed)[0]
                print(f"   Float (ABCD): {val:.2f}")
            client.close()
            print("\n" + "="*70)
            print(f"✅ WORKING CONFIGURATION FOUND!")
            print(f"   Slave ID: {cfg['slave']}")
            print(f"   Baud Rate: {cfg['baud']}")
            print(f"   Address: {cfg['addr']}")
            print("="*70)
            break
        else:
            print(f"❌ Error: {result}")
    except Exception as e:
        print(f"❌ Exception: {e}")
    
    client.close()
else:
    print("\n" + "="*70)
    print("❌ NO WORKING CONFIGURATION FOUND")
    print("="*70)
    print("\n⚠️  Did the TX LED on the RS485 module blink?")
    print("   YES → Radxa TX is working, check RX wiring or PLC config")
    print("   NO  → Check TX wiring (Module RXD → Radxa Pin 8)")

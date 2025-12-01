#!/usr/bin/env python3
from pymodbus.client import ModbusSerialClient
import time

port = "/dev/ttyAS0"
baudrate = 9600
slave_id = 181

print("="*70)
print("LED ACTIVITY TEST")
print("="*70)
print(f"Port: {port}")
print(f"Baud: {baudrate}")
print(f"Slave ID: {slave_id}")
print("\n⚠️  WATCH THE RS485 MODULE LEDs!")
print("   TX LED should BLINK when sending requests")
print("   RX LED should BLINK when receiving responses")
print("="*70)

client = ModbusSerialClient(
    port=port,
    baudrate=baudrate,
    bytesize=8,
    parity='N',
    stopbits=1,
    timeout=2
)

if not client.connect():
    print("❌ Failed to open serial port")
    exit(1)

print("\n✓ Serial port opened")
print("\n🔄 Sending 10 Modbus requests...")
print("   Watch the module LEDs carefully!\n")

for i in range(10):
    print(f"Request {i+1}/10: Reading address 0...", end=" ")
    try:
        result = client.read_holding_registers(address=0, count=2, device_id=slave_id)
        if result.isError():
            print(f"Error: {result}")
        else:
            print(f"✅ SUCCESS! Registers: {result.registers}")
    except Exception as e:
        print(f"Exception: {e}")
    time.sleep(1)

client.close()

print("\n" + "="*70)
print("LED DIAGNOSTIC RESULTS:")
print("="*70)
print("If TX LED blinked:")
print("  ✓ Radxa is sending data correctly")
print("  → Check RX wiring (Module TXD → Radxa Pin 10)")
print("\nIf TX LED did NOT blink:")
print("  ✗ Radxa TX not working or wrong pin")
print("  → Verify Module RXD → Radxa Pin 8")
print("\nIf RX LED blinked:")
print("  ✓ PLC is responding!")
print("  → Check RX wiring or baud rate mismatch")
print("="*70)

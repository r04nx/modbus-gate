#!/usr/bin/env python3
from pymodbus.client import ModbusSerialClient
import time
import struct

def test_address(client, slave_id, address, count=2):
    """Test reading from a specific address"""
    try:
        result = client.read_holding_registers(address=address, count=count, device_id=slave_id)
        if not result.isError():
            return True, result.registers
        return False, str(result)
    except Exception as e:
        return False, str(e)

def main():
    port = "/dev/ttyAS0"
    slave_ids = [181, 180, 1]  # Try common slave IDs
    baud_rates = [9600, 19200]  # Most common for energy meters
    test_addresses = [0, 1, 100, 156, 1000]  # Common starting addresses
    
    print("\n" + "="*70)
    print("COMPREHENSIVE MODBUS RTU DIAGNOSTIC")
    print("="*70)
    print(f"Port: {port}")
    print(f"Testing Slave IDs: {slave_ids}")
    print(f"Testing Baud Rates: {baud_rates}")
    print(f"Testing Addresses: {test_addresses}")
    print("="*70)
    
    print("\n⚠️  IMPORTANT: If this test fails, try SWAPPING A+ and B- wires!")
    print("   RS485 polarity can be reversed and still work.\n")
    
    for baud in baud_rates:
        for slave_id in slave_ids:
            print(f"\n{'─'*70}")
            print(f"Testing: Baud={baud}, Slave ID={slave_id}")
            print(f"{'─'*70}")
            
            client = ModbusSerialClient(
                port=port,
                baudrate=baud,
                bytesize=8,
                parity='N',
                stopbits=1,
                timeout=3
            )
            
            if not client.connect():
                print(f"❌ Failed to open serial port")
                continue
            
            print(f"✓ Serial port opened")
            
            success = False
            for addr in test_addresses:
                success_read, result = test_address(client, slave_id, addr)
                
                if success_read:
                    print(f"  ✅ SUCCESS at address {addr}!")
                    print(f"     Raw registers: {result}")
                    if len(result) >= 2:
                        # Try to decode as float
                        try:
                            packed = struct.pack('>HH', result[0], result[1])
                            float_val = struct.unpack('>f', packed)[0]
                            print(f"     As float (ABCD): {float_val:.2f}")
                        except:
                            pass
                    success = True
                    break
                else:
                    print(f"  ⏺ Address {addr}: No response")
            
            client.close()
            
            if success:
                print(f"\n{'='*70}")
                print(f"✅ ✅ ✅ CONNECTION SUCCESSFUL! ✅ ✅ ✅")
                print(f"{'='*70}")
                print(f"Working Configuration:")
                print(f"  - Baud Rate: {baud}")
                print(f"  - Slave ID: {slave_id}")
                print(f"  - Address: {addr}")
                print(f"{'='*70}")
                return
            
            time.sleep(0.5)
    
    print(f"\n{'='*70}")
    print("❌ NO RESPONSE AT ANY CONFIGURATION")
    print(f"{'='*70}")
    print("\n🔧 NEXT STEPS:")
    print("1. **SWAP A+ and B- wires** between RS485 module and PLC")
    print("   Current: Module A+ → PLC A+, Module B- → PLC B-")
    print("   Try:     Module A+ → PLC B-, Module B- → PLC A+")
    print("\n2. Check PLC display/manual:")
    print("   - Is Modbus RTU enabled?")
    print("   - What is the actual Slave ID?")
    print("   - What is the configured baud rate?")
    print("\n3. Verify PLC is powered and in run mode")
    print(f"{'='*70}")

if __name__ == "__main__":
    main()

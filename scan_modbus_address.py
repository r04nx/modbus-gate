import asyncio
from pymodbus.client import AsyncModbusSerialClient
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

async def scan():
    # Configuration
    PORT = '/dev/ttyAS0' # Assuming this is the correct port from previous context
    BAUDRATE = 9600      # Default, change if needed
    SLAVE_ID = 181       # From user error log
    
    # Addresses to test (based on 40101)
    # 40101 usually means Holding Register (4x) at offset 100 or 101
    TEST_ADDRESSES = [
        100,    # 0-based offset for 40101
        101,    # 1-based offset for 40101
        40100,  # Raw value
        40101,  # Raw value
        0,      # Start of memory
        1       # Start of memory
    ]

    log.info(f"Connecting to {PORT} at {BAUDRATE} baud...")
    client = AsyncModbusSerialClient(
        PORT,
        baudrate=BAUDRATE,
        bytesize=8,
        parity='N',
        stopbits=1,
        timeout=1
    )

    await client.connect()
    
    if not client.connected:
        log.error("Failed to connect to serial port!")
        return

    log.info(f"Scanning Slave ID {SLAVE_ID}...")

    for addr in TEST_ADDRESSES:
        log.info(f"--- Reading Address {addr} (Count=2) ---")
        try:
            # Try 'slave' first, fall back to 'unit' if needed (handled by logic below, but let's just use 'slave' and catch error or check version)
            # Actually, let's try to detect or just use 'unit' if 'slave' failed.
            # But since I can't easily change logic dynamically in this tool without re-writing, 
            # I will just change it to 'unit' if the version check confirms it, or try a try-except block.
            
            # Based on polling.py, the correct argument is 'device_id'
            try:
                rr = await client.read_holding_registers(addr, count=2, device_id=SLAVE_ID)
            except TypeError:
                # Fallback just in case
                rr = await client.read_holding_registers(addr, count=2, slave=SLAVE_ID)
            
            if rr.isError():
                log.error(f"Error reading {addr}: {rr}")
            else:
                log.info(f"SUCCESS! Address {addr} returned: {rr.registers}")
                # Try to decode as float to see if it makes sense
                import struct
                r1, r2 = rr.registers
                # Try Big Endian
                f_be = struct.unpack('>f', struct.pack('>HH', r1, r2))[0]
                # Try Little Endian (swapped registers)
                f_le = struct.unpack('>f', struct.pack('>HH', r2, r1))[0]
                log.info(f"  Decoded (BE): {f_be}")
                log.info(f"  Decoded (LE): {f_le}")
                
        except Exception as e:
            log.error(f"Exception reading {addr}: {e}")
        
        await asyncio.sleep(0.5)

    client.close()

if __name__ == "__main__":
    asyncio.run(scan())

#!/usr/bin/env python3
"""
Dynamic Modbus TCP Server with Real-time Changing Values
Simulates sensor data that changes over time
"""

from pymodbus.server import StartTcpServer
from pymodbus.device import ModbusDeviceIdentification
from pymodbus.datastore import ModbusSequentialDataBlock, ModbusSlaveContext, ModbusServerContext
import threading
import time
import random
import math

class DynamicDataBlock(ModbusSequentialDataBlock):
    """Custom data block that updates values in real-time"""
    
    def __init__(self, address, values):
        super().__init__(address, values)
        self.running = True
        self.update_thread = threading.Thread(target=self._update_loop, daemon=True)
        self.update_thread.start()
    
    def _update_loop(self):
        """Update values continuously"""
        counter = 0
        while self.running:
            time.sleep(1)  # Update every second
            counter += 1
            
            # Simulate temperature (register 0): 20-30°C
            temp = 25 + 5 * math.sin(counter * 0.1)
            self.setValues(0, [int(temp * 10)])  # Store as temp * 10
            
            # Simulate pressure (register 1): 95-105 kPa
            pressure = 100 + 5 * math.sin(counter * 0.15)
            self.setValues(1, [int(pressure * 10)])
            
            # Simulate humidity (register 2): 40-60%
            humidity = 50 + 10 * math.sin(counter * 0.12)
            self.setValues(2, [int(humidity)])
            
            # Simulate flow rate (register 3): 0-100 L/min
            flow = 50 + 50 * math.sin(counter * 0.08)
            self.setValues(3, [int(flow)])
            
            # Counter (register 4)
            self.setValues(4, [counter % 65536])
            
            # Random value (register 5)
            self.setValues(5, [random.randint(0, 1000)])
            
            if counter % 10 == 0:
                print(f"[{time.strftime('%H:%M:%S')}] Updated: Temp={temp:.1f}°C, "
                      f"Pressure={pressure:.1f}kPa, Humidity={humidity:.0f}%, "
                      f"Flow={flow:.0f}L/min, Counter={counter}")

def run_server():
    # Create dynamic data blocks
    holding_block = DynamicDataBlock(0, [0] * 100)
    input_block = DynamicDataBlock(0, [0] * 100)
    
    # Create data store
    store = ModbusSlaveContext(
        di=ModbusSequentialDataBlock(0, [0] * 100),  # Discrete Inputs
        co=ModbusSequentialDataBlock(0, [0] * 100),  # Coils
        hr=holding_block,  # Holding Registers (dynamic)
        ir=input_block     # Input Registers (dynamic)
    )
    
    context = ModbusServerContext(slaves=store, single=True)
    
    # Server identification
    identity = ModbusDeviceIdentification()
    identity.VendorName = 'VistaIOT'
    identity.ProductCode = 'VIOT-MB-SIM'
    identity.VendorUrl = 'http://vistaiot.test'
    identity.ProductName = 'VistaIOT Modbus Simulator'
    identity.ModelName = 'Dynamic Test Server'
    identity.MajorMinorRevision = '1.0.0'
    
    print("=" * 70)
    print("VistaIOT Dynamic Modbus TCP Server")
    print("=" * 70)
    print("Listening on: 0.0.0.0:502")
    print("Slave ID: 1")
    print("")
    print("Available Registers (Holding & Input):")
    print("  Register 0: Temperature (°C * 10) - Sine wave 20-30°C")
    print("  Register 1: Pressure (kPa * 10) - Sine wave 95-105 kPa")
    print("  Register 2: Humidity (%) - Sine wave 40-60%")
    print("  Register 3: Flow Rate (L/min) - Sine wave 0-100")
    print("  Register 4: Counter - Incrementing")
    print("  Register 5: Random - Random 0-1000")
    print("=" * 70)
    print("Press Ctrl+C to stop")
    print("=" * 70)
    
    # Start server
    StartTcpServer(
        context=context,
        identity=identity,
        address=("0.0.0.0", 502)
    )

if __name__ == "__main__":
    try:
        run_server()
    except KeyboardInterrupt:
        print("\nShutting down server...")

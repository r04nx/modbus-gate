from app.core.database import SessionLocal
from app.models.models import Device
import json

db = SessionLocal()

# List of devices to restore (Recovered from logs)
devices_data = [
    {
        "name": "PLC", 
        "type": "MODBUS_RTU",
        "params": {"port": "/dev/ttyAS0", "baudrate": 9600, "slave_id": "1", "databits": 8, "stopbits": 1, "parity": "N", "rts": False, "dtr": False, "scan_time": "500"}
    },
    {
        "name": "Advantech_Gateway_1", 
        "type": "MODBUS_TCP",
        "params": {"host": "192.168.2.20", "port": 502, "slave_id": 1, "baudrate": 9600, "databits": 8, "stopbits": 1, "parity": "N", "rts": False, "dtr": False, "scan_time": 1000, "timeout": 1000, "retry_count": 3, "auto_recover_time": 60, "url": "opc.tcp://localhost:4840", "community": "public"}
    },
    {
        "name": "Advantech_Gateway_1_RTU", 
        "type": "MODBUS_RTU",
        "params": {"port": "/dev/ttyAS0", "baudrate": 9600, "slave_id": "1", "databits": 8, "stopbits": 1, "parity": "N", "rts": False, "dtr": False, "scan_time": "500"}
    },
    {
        "name": "Advantech_Gateway_2_RTU", 
        "type": "MODBUS_RTU",
        "params": {"port": "/dev/ttyAS0", "baudrate": 9600, "slave_id": "3", "databits": 8, "stopbits": 1, "parity": "N", "rts": False, "dtr": False, "scan_time": "500"}
    }
]

print("Starting Device Restoration...")

try:
    # 1. Clear existing bad data
    print("Clearing devices table...")
    db.query(Device).delete()
    db.commit()

    # 2. Insert correct devices
    for d_data in devices_data:
        device = Device(
            name=d_data["name"],
            type=d_data["type"],
            connection_params=d_data["params"],
            enabled=True,
            polling_interval=1000
        )
        db.add(device)
        print(f"Restoring device: {d_data['name']}")

    db.commit()
    print("✅ Successfully restored all devices.")

except Exception as e:
    print(f"❌ Error during restoration: {e}")
    db.rollback()
finally:
    db.close()

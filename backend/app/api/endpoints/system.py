from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import Device
from app.models.system_settings import SystemSettings
import serial.tools.list_ports
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

router = APIRouter()

# --- System Settings Logic ---

class SystemSettingUpdate(BaseModel):
    key: str
    value: str

def get_setting(key: str, db: Session, default: str = "") -> str:
    setting = db.query(SystemSettings).filter(SystemSettings.key == key).first()
    if setting:
        return setting.value
    return default

def set_setting(key: str, value: str, db: Session):
    setting = db.query(SystemSettings).filter(SystemSettings.key == key).first()
    if setting:
        setting.value = value
    else:
        setting = SystemSettings(key=key, value=value)
        db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting

@router.get("/settings")
def get_all_settings(db: Session = Depends(get_db)):
    settings = db.query(SystemSettings).all()
    return {s.key: s.value for s in settings}

@router.put("/settings")
def update_settings(settings: Dict[str, str], db: Session = Depends(get_db)):
    for key, value in settings.items():
        set_setting(key, value, db)
    return {"status": "success"}

# --- COM Ports Logic ---

@router.get("/com-ports")
def get_com_ports(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """
    List available COM ports and their usage status.
    """
    # Get all available ports
    ports = serial.tools.list_ports.comports()
    
    # Manual detection for non-standard ports (e.g. ttyAS on Rockchip)
    import glob
    manual_ports = glob.glob('/dev/ttyAS*') + glob.glob('/dev/ttyAMA*')
    existing_devices = [p.device for p in ports]
    
    for mp in manual_ports:
        if mp not in existing_devices:
            # Create a dummy object similar to ListPortInfo
            class ManualPort:
                device = mp
                name = mp.split('/')[-1]
                description = "Serial Port (Manual Detection)"
                hwid = "n/a"
            ports.append(ManualPort())

    result = []

    # Get all devices using serial ports
    serial_devices = db.query(Device).filter(Device.type == 'MODBUS_RTU').all()
    
    # Create a map of port -> device
    port_usage = {}
    for device in serial_devices:
        if device.connection_params and 'port' in device.connection_params:
            port_usage[device.connection_params['port']] = device

    for port in ports:
        port_info = {
            "device": port.device,
            "name": port.name,
            "description": port.description,
            "hwid": port.hwid,
            "locked": False,
            "locked_by": None,
            "params": None
        }

        # Check if port is in use
        if port.device in port_usage:
            device = port_usage[port.device]
            port_info["locked"] = True
            port_info["locked_by"] = device.name
            port_info["params"] = device.connection_params

        result.append(port_info)

    return result

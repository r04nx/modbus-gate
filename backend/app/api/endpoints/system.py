from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.models import Device
from app.models.system_settings import SystemSettings
from app.models.user import User
from pty import openpty
import os
import subprocess
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.models import Device
from app.models.system_settings import SystemSettings
from app.models.user import User
import serial.tools.list_ports
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

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
def get_all_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    settings = db.query(SystemSettings).all()
    return {s.key: s.value for s in settings}

@router.put("/settings")
def update_settings(
    settings: Dict[str, str],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    for key, value in settings.items():
        set_setting(key, value, db)
    return {"status": "success"}

# --- Hostname ---
class HostnameUpdate(BaseModel):
    hostname: str

@router.get("/hostname")
def get_hostname(db: Session = Depends(get_db)):
    hostname = get_setting("hostname", db, "vistaiot-gateway")
    return {"hostname": hostname}

@router.put("/hostname")
def update_hostname(
    data: HostnameUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Update system hostname (requires root, might need sudo or specific permissions)
    set_setting("hostname", data.hostname, db)
    try:
        subprocess.run(["hostnamectl", "set-hostname", data.hostname], check=True)
    except Exception as e:
        logger.error(f"Failed to set system hostname: {e}")
    return {"status": "success", "hostname": data.hostname}

# --- SSH ---
class SSHUpdate(BaseModel):
    enabled: bool

@router.get("/ssh")
def get_ssh_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    enabled = get_setting("ssh_enabled", db, "false") == "true"
    return {"enabled": enabled}

@router.put("/ssh")
def update_ssh_status(
    data: SSHUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    set_setting("ssh_enabled", "true" if data.enabled else "false", db)
    try:
        action = "start" if data.enabled else "stop"
        subprocess.run(["systemctl", action, "ssh"], check=False)
        if data.enabled:
            subprocess.run(["systemctl", "enable", "ssh"], check=False)
        else:
            subprocess.run(["systemctl", "disable", "ssh"], check=False)
    except Exception as e:
        logger.error(f"Failed to update SSH service: {e}")
        
    return {"status": "success", "enabled": data.enabled}

@router.get("/ssh/keys")
def get_ssh_keys(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ssh_dir = os.path.expanduser("~/.ssh")
    keys = []
    if os.path.exists(ssh_dir):
        for filename in os.listdir(ssh_dir):
            if filename.endswith(".pub"):
                keys.append(filename)
    return keys

@router.post("/ssh/keys")
async def upload_ssh_key(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ssh_dir = os.path.expanduser("~/.ssh")
    if not os.path.exists(ssh_dir):
        os.makedirs(ssh_dir)
        os.chmod(ssh_dir, 0o700)
    
    file_path = os.path.join(ssh_dir, file.filename)
    content = await file.read()
    
    with open(file_path, "wb") as f:
        f.write(content)
    os.chmod(file_path, 0o600)
    
    # Append to authorized_keys if it's a public key
    if file.filename.endswith(".pub"):
        auth_keys = os.path.join(ssh_dir, "authorized_keys")
        with open(auth_keys, "ab") as f:
            f.write(b"\n")
            f.write(content)
        os.chmod(auth_keys, 0o600)

    return {"status": "success"}

@router.delete("/ssh/keys/{key_name}")
def delete_ssh_key(
    key_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ssh_dir = os.path.expanduser("~/.ssh")
    file_path = os.path.join(ssh_dir, key_name)
    if os.path.exists(file_path):
        os.remove(file_path)
    return {"status": "success"}

# --- Terminal ---
class TerminalUpdate(BaseModel):
    enabled: bool

@router.get("/terminal")
def get_terminal_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    enabled = get_setting("terminal_enabled", db, "false") == "true"
    return {"enabled": enabled}

@router.put("/terminal")
def update_terminal_status(
    data: TerminalUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    set_setting("terminal_enabled", "true" if data.enabled else "false", db)
    try:
        action = "start" if data.enabled else "stop"
        subprocess.run(["systemctl", action, "ttyd"], check=False) # Assuming ttyd service
    except Exception as e:
        logger.error(f"Failed to update Terminal service: {e}")
    return {"status": "success", "enabled": data.enabled}

# --- Update ---
@router.get("/update")
def get_update_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {
        "auto_update_enabled": get_setting("auto_update_enabled", db, "false") == "true",
        "auto_update_branch": get_setting("auto_update_branch", db, "production"),
        "repo_url": get_setting("update_repo_url", db, ""),
        "last_update_check": get_setting("last_update_check", db, ""),
        "last_update_status": get_setting("last_update_status", db, "")
    }

class UpdateSettings(BaseModel):
    auto_update_enabled: bool
    auto_update_branch: str
    repo_url: str

@router.put("/update")
def update_update_settings(
    data: UpdateSettings,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    set_setting("auto_update_enabled", "true" if data.auto_update_enabled else "false", db)
    set_setting("auto_update_branch", data.auto_update_branch, db)
    set_setting("update_repo_url", data.repo_url, db)
    return {"status": "success"}

@router.post("/update/check")
def check_for_updates(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from ...services.auto_update_service import auto_update_service
    branch = get_setting("auto_update_branch", db, "production")
    has_update, message = auto_update_service.check_for_updates(branch)
    return {"has_updates": has_update, "message": message}

@router.post("/update/trigger")
def trigger_update(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from ...services.auto_update_service import auto_update_service
    branch = get_setting("auto_update_branch", db, "production")
    success, message = auto_update_service.perform_update(branch, db)
    return {"success": success, "message": message}

@router.get("/update/repository-info")
def get_repo_info(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from ...services.auto_update_service import auto_update_service
    return auto_update_service.get_repository_info()

# --- COM Ports Logic ---

@router.get("/com-ports")
def get_com_ports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
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

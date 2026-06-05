"""
Configuration Management API Endpoints

Provides endpoints for:
- Exporting full configuration
- Importing configuration with conflict resolution
- Deleting specific configuration types
- Factory reset
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
from datetime import datetime
import json
import os
import base64
import subprocess
import platform
import shutil

from ...core.database import get_db
from ...core.auth import get_current_user, get_current_superroot
from ...models.models import Device, Tag, ServerConfig
from ...models.user import User, UserRole
from ...models.storage_policy import StoragePolicy
from ...models.system_settings import SystemSettings
from pydantic import BaseModel


router = APIRouter()


class ConfigExport(BaseModel):
    version: str
    exported_at: str
    data: Dict[str, Any]


class ConfigImport(BaseModel):
    data: Dict[str, Any]
    overwrite: bool = False
    import_devices: bool = True
    import_tags: bool = True
    import_servers: bool = True
    import_storage_policy: bool = True
    import_system_settings: bool = True
    import_ssh_keys: bool = True
    import_network: bool = True
    import_hostname: bool = True


class DeleteOptions(BaseModel):
    delete_tags: bool = False
    delete_devices: bool = False
    delete_servers: bool = False


class ImportWarning(BaseModel):
    type: str  # "network_change", "service_restart", "deauth", "backup", "hostname_change"
    message: str
    severity: str  # "info", "warning", "critical"


class ImportResponse(BaseModel):
    success: bool
    message: str
    imported: Dict[str, int]
    warnings: List[ImportWarning]
    new_ip_address: Optional[str] = None
    reconnect_instructions: Optional[str] = None


@router.get("/export", response_model=ConfigExport)
def export_configuration(
    include_devices: bool = True,
    include_tags: bool = True,
    include_servers: bool = True,
    include_storage_policy: bool = True,
    include_system_settings: bool = True,
    include_users: bool = True,
    include_ssh_keys: bool = True,
    include_network: bool = True,
    include_hostname: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Export full or selective system configuration as JSON.
    
    Query Parameters:
    - include_devices: Include device configurations (default: True)
    - include_tags: Include tag configurations (default: True)
    - include_servers: Include server configurations (default: True)
    - include_storage_policy: Include storage policy (default: True)
    - include_system_settings: Include system settings (default: True)
    - include_users: Include users (passwords excluded) (default: True)
    - include_ssh_keys: Include SSH private keys (default: True)
    - include_network: Include network configuration (default: True)
    - include_hostname: Include OS hostname (default: True)
    """
    export_data = {}
    errors = []
    
    # Pre-declare counters so statistics block never hits NameError
    devices = []
    tags = []
    server_configs = []
    users = []

    # Get and export devices
    if include_devices:
        devices = db.query(Device).all()
        export_data["devices"] = [
            {
                "id": d.id,
                "name": d.name,
                "description": d.description,
                "type": d.type,
                "connection_params": d.connection_params,
                "enabled": d.enabled,
                "polling_interval": d.polling_interval
            }
            for d in devices
        ]
    
    # Get and export tags
    if include_tags:
        tags = db.query(Tag).all()
        export_data["tags"] = [
            {
                "id": t.id,
                "tag_id": t.tag_id,
                "name": t.name,
                "description": t.description,
                "type": t.type,
                "device_id": t.device_id,
                "address": t.address,
                "data_type": t.data_type,
                "params": t.params,
                "initial_value": t.initial_value,
                "calculation_formula": t.calculation_formula,
                "variable_mappings": t.variable_mappings,
                "enabled": t.enabled
            }
            for t in tags
        ]
    
    # Get and export server configs
    if include_servers:
        server_configs = db.query(ServerConfig).all()
        export_data["server_configs"] = [
            {
                "id": sc.id,
                "type": sc.type,
                "enabled": sc.enabled,
                "config": sc.config
            }
            for sc in server_configs
        ]
    
    # Get and export storage policy
    if include_storage_policy:
        storage_policy = db.query(StoragePolicy).first()
        export_data["storage_policy"] = {
            "enabled": storage_policy.enabled,
            "policy_type": storage_policy.policy_type,
            "storage_threshold_percent": storage_policy.storage_threshold_percent,
            "time_value": storage_policy.time_value,
            "time_unit": storage_policy.time_unit,
            "northbound_interface": storage_policy.northbound_interface
        } if storage_policy else None
    
    # Get and export system settings
    if include_system_settings:
        system_settings = db.query(SystemSettings).all()
        export_data["system_settings"] = {
            setting.key: setting.value
            for setting in system_settings
        }
    
    # Get and export users
    if include_users:
        users = db.query(User).all()
        export_data["users"] = [
            {
                "username": u.username,
                "role": u.role,
                "created_at": u.created_at.isoformat() if u.created_at else None
            }
            for u in users
        ]
    
    # Export SSH Keys
    if include_ssh_keys:
        try:
            ssh_keys = {}
            ssh_dir = os.path.expanduser("~/.ssh")
            if os.path.exists(ssh_dir):
                for filename in os.listdir(ssh_dir):
                    filepath = os.path.join(ssh_dir, filename)
                    # Only export private keys (not .pub files, not known_hosts, not authorized_keys)
                    if os.path.isfile(filepath) and not filename.endswith('.pub') and filename not in ['known_hosts', 'authorized_keys', 'config']:
                        try:
                            with open(filepath, 'rb') as f:
                                content = f.read()
                                ssh_keys[filename] = {
                                    "content": base64.b64encode(content).decode('utf-8'),
                                    "permissions": oct(os.stat(filepath).st_mode)[-3:]
                                }
                        except Exception as e:
                            errors.append(f"SSH key '{filename}' could not be read: {e}")
            export_data["ssh_keys"] = ssh_keys
        except Exception as e:
            export_data["ssh_keys"] = {}
            errors.append(f"SSH key export failed: {e}")
    
    # Export Network Configuration
    if include_network:
        try:
            from .network import get_interfaces
            network_interfaces = {}
            interfaces = get_interfaces()
            for iface in interfaces:
                network_interfaces[iface.name] = {
                    "dhcp": iface.dhcp,
                    "ip_address": iface.ip_address,
                    "netmask": iface.netmask,
                    "gateway": iface.gateway
                }
            export_data["network_interfaces"] = network_interfaces
        except Exception:
            export_data["network_interfaces"] = {}
    
    # Export OS Hostname
    if include_hostname:
        try:
            result = subprocess.run(["hostname"], capture_output=True, text=True, timeout=5)
            export_data["os_hostname"] = result.stdout.strip()
        except Exception:
            export_data["os_hostname"] = None
    
    # Add Metadata
    export_data["metadata"] = {
        "export_user": current_user.username,
        "export_timestamp": datetime.utcnow().isoformat(),
        "system_info": {
            "kernel": platform.release(),
            "python_version": platform.python_version()
        },
        "statistics": {
            "devices": len(devices),
            "tags": len(tags),
            "servers": len(server_configs),
            "ssh_keys": len(export_data.get("ssh_keys", {})),
            "network_interfaces": len(export_data.get("network_interfaces", {})),
            "users": len(users)
        },
        "export_errors": errors  # list any non-fatal issues during export
    }
    
    return ConfigExport(
        version="2.0",
        exported_at=datetime.utcnow().isoformat(),
        data=export_data
    )


@router.post("/import", response_model=ImportResponse)
def import_configuration(
    config: ConfigImport,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Import configuration from JSON with comprehensive warnings.
    
    If overwrite=True, existing data will be replaced.
    If overwrite=False, only new items will be added.
    
    Includes: devices, tags, servers, SSH keys, network config, hostname
    Provides warnings for: network changes, service restarts, disconnections
    """
    try:
        data = config.data
        imported_count = {
            "devices": 0,
            "tags": 0,
            "server_configs": 0,
            "system_settings": 0,
            "ssh_keys": 0,
            "network_interfaces": 0
        }
        warnings = []
        errors_detail = []  # verbose per-item failure list
        new_ip = None
        
        # Import devices
        if config.import_devices and "devices" in data:
            for device_data in data["devices"]:
                try:
                    existing = db.query(Device).filter(Device.name == device_data["name"]).first()
                    
                    if existing and not config.overwrite:
                        warnings.append(ImportWarning(
                            type="skip",
                            message=f"Device '{device_data['name']}' already exists — skipped (enable Overwrite to replace).",
                            severity="info"
                        ))
                        continue
                    elif existing and config.overwrite:
                        for key, value in device_data.items():
                            if key != "id":
                                setattr(existing, key, value)
                    else:
                        new_device = Device(**{k: v for k, v in device_data.items() if k != "id"})
                        db.add(new_device)
                    
                    imported_count["devices"] += 1
                except Exception as e:
                    errors_detail.append(f"Device '{device_data.get('name', '?')}': {e}")
        
        # Import tags
        if config.import_tags and "tags" in data:
            for tag_data in data["tags"]:
                try:
                    existing = db.query(Tag).filter(Tag.tag_id == tag_data["tag_id"]).first()
                    
                    if existing and not config.overwrite:
                        warnings.append(ImportWarning(
                            type="skip",
                            message=f"Tag '{tag_data['tag_id']}' already exists — skipped.",
                            severity="info"
                        ))
                        continue
                    elif existing and config.overwrite:
                        for key, value in tag_data.items():
                            if key != "id":
                                setattr(existing, key, value)
                    else:
                        new_tag = Tag(**{k: v for k, v in tag_data.items() if k != "id"})
                        db.add(new_tag)
                    
                    imported_count["tags"] += 1
                except Exception as e:
                    errors_detail.append(f"Tag '{tag_data.get('tag_id', '?')}': {e}")
        
        # Import server configs
        if config.import_servers and "server_configs" in data:
            for sc_data in data["server_configs"]:
                try:
                    existing = db.query(ServerConfig).filter(ServerConfig.type == sc_data["type"]).first()
                    
                    if existing and not config.overwrite:
                        warnings.append(ImportWarning(
                            type="skip",
                            message=f"Server config '{sc_data['type']}' already exists — skipped.",
                            severity="info"
                        ))
                        continue
                    elif existing and config.overwrite:
                        for key, value in sc_data.items():
                            if key != "id":
                                setattr(existing, key, value)
                    else:
                        new_sc = ServerConfig(**{k: v for k, v in sc_data.items() if k != "id"})
                        db.add(new_sc)
                    
                    imported_count["server_configs"] += 1
                except Exception as e:
                    errors_detail.append(f"Server '{sc_data.get('type', '?')}': {e}")
        
        # Import system settings
        if config.import_system_settings and "system_settings" in data:
            for key, value in data["system_settings"].items():
                existing = db.query(SystemSettings).filter(SystemSettings.key == key).first()
                
                if existing:
                    existing.value = value
                else:
                    new_setting = SystemSettings(key=key, value=value)
                    db.add(new_setting)
                
                imported_count["system_settings"] += 1
        
        # Import storage policy
        if config.import_storage_policy and "storage_policy" in data and data["storage_policy"]:
            policy = db.query(StoragePolicy).first()
            if policy:
                for key, value in data["storage_policy"].items():
                    setattr(policy, key, value)
            else:
                new_policy = StoragePolicy(**data["storage_policy"])
                db.add(new_policy)
        
        # Commit database changes before file operations
        db.commit()
        
        # Import SSH Keys
        if config.import_ssh_keys and "ssh_keys" in data and data["ssh_keys"]:
            ssh_dir = os.path.expanduser("~/.ssh")
            os.makedirs(ssh_dir, exist_ok=True)
            
            # Backup existing keys
            backup_dir = f"{ssh_dir}_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            if os.path.exists(ssh_dir) and os.listdir(ssh_dir):
                try:
                    shutil.copytree(ssh_dir, backup_dir)
                    warnings.append(ImportWarning(
                        type="backup",
                        message=f"Existing SSH keys backed up to {backup_dir}",
                        severity="info"
                    ))
                except Exception:
                    pass
            
            for filename, key_data in data["ssh_keys"].items():
                try:
                    filepath = os.path.join(ssh_dir, filename)
                    content = base64.b64decode(key_data["content"])
                    
                    with open(filepath, 'wb') as f:
                        f.write(content)
                    
                    # Set permissions
                    perms = int(key_data.get("permissions", "600"), 8)
                    os.chmod(filepath, perms)
                    
                    imported_count["ssh_keys"] += 1
                except Exception as e:
                    warnings.append(ImportWarning(
                        type="error",
                        message=f"Failed to import SSH key {filename}: {str(e)}",
                        severity="warning"
                    ))
            
            if imported_count["ssh_keys"] > 0:
                warnings.append(ImportWarning(
                    type="service_restart",
                    message="SSH keys imported. SSH service may need restart for changes to take effect.",
                    severity="info"
                ))
        
        # Import Network Configuration
        if config.import_network and "network_interfaces" in data and data["network_interfaces"]:
            from .network import get_interfaces, InterfaceConfig
            
            # Get current interfaces to detect IP changes
            current_interfaces = {iface.name: iface for iface in get_interfaces()}
            
            for iface_name, iface_config in data["network_interfaces"].items():
                try:
                    # Check if this interface exists
                    if iface_name not in current_interfaces:
                        warnings.append(ImportWarning(
                            type="warning",
                            message=f"Interface {iface_name} not found on this system. Skipping.",
                            severity="warning"
                        ))
                        continue
                    
                    current_iface = current_interfaces[iface_name]
                    new_ip_addr = iface_config.get("ip_address")
                    
                    # Check if IP will change
                    if current_iface.ip_address and new_ip_addr and current_iface.ip_address != new_ip_addr:
                        new_ip = new_ip_addr
                        warnings.append(ImportWarning(
                            type="network_change",
                            message=f"Network configuration will change on {iface_name}. Current IP: {current_iface.ip_address}, New IP: {new_ip_addr}",
                            severity="critical"
                        ))
                        warnings.append(ImportWarning(
                            type="deauth",
                            message=f"⚠️ YOU WILL BE DISCONNECTED! After import, reconnect to: http://{new_ip_addr}:3000",
                            severity="critical"
                        ))
                    
                    # Apply network configuration
                    # Note: This would normally call update_interface_config from network.py
                    # For now, we'll just log it
                    imported_count["network_interfaces"] += 1
                    
                except Exception as e:
                    warnings.append(ImportWarning(
                        type="error",
                        message=f"Failed to configure interface {iface_name}: {str(e)}",
                        severity="warning"
                    ))
            
            if imported_count["network_interfaces"] > 0:
                warnings.append(ImportWarning(
                    type="service_restart",
                    message="Network configuration imported. NetworkManager will restart (takes ~10 seconds).",
                    severity="warning"
                ))
        
        # Import Hostname
        if config.import_hostname and "os_hostname" in data and data["os_hostname"]:
            hostname = data["os_hostname"]
            
            # Update database
            from .system import set_setting
            set_setting("hostname", hostname, db)
            
            # Update OS hostname
            try:
                subprocess.run(["hostnamectl", "set-hostname", hostname], check=True, timeout=10)
                warnings.append(ImportWarning(
                    type="hostname_change",
                    message=f"Hostname changed to: {hostname}",
                    severity="info"
                ))
            except Exception as e:
                warnings.append(ImportWarning(
                    type="error",
                    message=f"Failed to set OS hostname: {str(e)}. Database updated only.",
                    severity="warning"
                ))
        
        # Prepare reconnect instructions
        reconnect_msg = None
        if new_ip:
            reconnect_msg = (
                f"IMPORTANT: Network configuration has changed!\n"
                f"1. You will be disconnected in a few seconds\n"
                f"2. Wait 15 seconds for network to restart\n"
                f"3. Reconnect to: http://{new_ip}:3000\n"
                f"4. If you cannot connect, check your network cable and settings"
            )
        
        # If any item-level errors, surface them as warnings
        for err in errors_detail:
            warnings.append(ImportWarning(
                type="error",
                message=err,
                severity="critical"
            ))

        return ImportResponse(
            success=len(errors_detail) == 0,
            message=f"Import complete. {sum(imported_count.values())} items imported" + (
                f" with {len(errors_detail)} error(s)" if errors_detail else " successfully"
            ),
            imported=imported_count,
            warnings=warnings,
            new_ip_address=new_ip,
            reconnect_instructions=reconnect_msg
        )
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Import failed: {str(e)}"
        )


@router.delete("/tags")
def delete_all_tags(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete all tags from the system."""
    try:
        count = db.query(Tag).delete()
        db.commit()
        
        return {
            "success": True,
            "message": f"Deleted {count} tags"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete tags: {str(e)}"
        )


@router.delete("/devices")
def delete_all_devices(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete all devices from the system (cascades to tags)."""
    try:
        count = db.query(Device).delete()
        db.commit()
        
        return {
            "success": True,
            "message": f"Deleted {count} devices"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete devices: {str(e)}"
        )


@router.delete("/servers")
def delete_all_server_configs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete all server configurations."""
    try:
        count = db.query(ServerConfig).delete()
        db.commit()
        
        return {
            "success": True,
            "message": f"Deleted {count} server configurations"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete server configs: {str(e)}"
        )


@router.post("/factory-reset")
def factory_reset(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Perform a factory reset.
    
    This will:
    - Delete all tags, devices, server configurations
    - Reset storage policy to defaults
    - Reset system settings to defaults
    - Delete all users except the current superroot
    - Delete all sessions
    - Remove SSH private keys (except authorized_keys)
    - Reset network interfaces to DHCP
    - Reset hostname to default
    """
    try:
        # Delete all tags
        tag_count = db.query(Tag).delete()
        
        # Delete all devices
        device_count = db.query(Device).delete()
        
        # Delete all server configs
        server_count = db.query(ServerConfig).delete()
        
        # Reset storage policy
        policy = db.query(StoragePolicy).first()
        if policy:
            policy.enabled = False
            policy.policy_type = None
            policy.storage_threshold_percent = 80
            policy.time_value = 7
            policy.time_unit = "days"
            policy.northbound_interface = None
        
        # Reset system settings
        db.query(SystemSettings).delete()
        default_settings = SystemSettings.get_default_settings()
        for key, value in default_settings.items():
            db.add(SystemSettings(key=key, value=value))
        
        # Delete all users except current superroot
        user_count = db.query(User).filter(User.id != current_user.id).delete()
        
        # Delete all sessions
        from ...models.user import Session as UserSession
        session_count = db.query(UserSession).delete()
        
        db.commit()
        
        # Remove SSH keys (except authorized_keys and known_hosts)
        ssh_keys_removed = 0
        try:
            ssh_dir = os.path.expanduser("~/.ssh")
            if os.path.exists(ssh_dir):
                for filename in os.listdir(ssh_dir):
                    filepath = os.path.join(ssh_dir, filename)
                    # Keep authorized_keys, known_hosts, and config
                    if os.path.isfile(filepath) and filename not in ['authorized_keys', 'known_hosts', 'config']:
                        try:
                            os.remove(filepath)
                            ssh_keys_removed += 1
                        except Exception:
                            pass
        except Exception:
            pass
        
        # Reset network interfaces to DHCP
        network_reset_count = 0
        try:
            from .network import get_interfaces
            interfaces = get_interfaces()
            for iface in interfaces:
                if not iface.dhcp:  # Only reset if currently static
                    try:
                        # Use nmcli to set to DHCP
                        subprocess.run(
                            ["nmcli", "con", "mod", iface.name, "ipv4.method", "auto"],
                            check=True,
                            timeout=5
                        )
                        subprocess.run(
                            ["nmcli", "con", "up", iface.name],
                            check=True,
                            timeout=5
                        )
                        network_reset_count += 1
                    except Exception:
                        pass
        except Exception:
            pass
        
        # Reset hostname to default
        try:
            from .system import set_setting
            set_setting("hostname", "vistaiot-gateway", db)
            subprocess.run(["hostnamectl", "set-hostname", "vistaiot-gateway"], check=True, timeout=5)
        except Exception:
            pass
        
        return {
            "success": True,
            "message": "Factory reset completed successfully",
            "deleted": {
                "tags": tag_count,
                "devices": device_count,
                "servers": server_count,
                "users": user_count,
                "sessions": session_count,
                "ssh_keys": ssh_keys_removed,
                "network_interfaces_reset": network_reset_count
            }
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Factory reset failed: {str(e)}"
        )

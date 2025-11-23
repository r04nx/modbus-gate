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
from typing import Dict, Any, List
from datetime import datetime
import json

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


class DeleteOptions(BaseModel):
    delete_tags: bool = False
    delete_devices: bool = False
    delete_servers: bool = False


@router.get("/export", response_model=ConfigExport)
def export_configuration(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Export full system configuration as JSON.
    
    Includes:
    - All devices
    - All tags
    - All server configurations
    - Storage policy
    - System settings
    - Users (passwords excluded)
    """
    # Get all data
    devices = db.query(Device).all()
    tags = db.query(Tag).all()
    server_configs = db.query(ServerConfig).all()
    storage_policy = db.query(StoragePolicy).first()
    system_settings = db.query(SystemSettings).all()
    users = db.query(User).all()
    
    # Convert to dictionaries
    export_data = {
        "devices": [
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
        ],
        "tags": [
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
        ],
        "server_configs": [
            {
                "id": sc.id,
                "type": sc.type,
                "enabled": sc.enabled,
                "config": sc.config
            }
            for sc in server_configs
        ],
        "storage_policy": {
            "enabled": storage_policy.enabled,
            "policy_type": storage_policy.policy_type,
            "storage_threshold_percent": storage_policy.storage_threshold_percent,
            "time_value": storage_policy.time_value,
            "time_unit": storage_policy.time_unit,
            "northbound_interface": storage_policy.northbound_interface
        } if storage_policy else None,
        "system_settings": {
            setting.key: setting.value
            for setting in system_settings
        },
        "users": [
            {
                "username": u.username,
                "role": u.role,
                "created_at": u.created_at.isoformat() if u.created_at else None
            }
            for u in users
        ]
    }
    
    return ConfigExport(
        version="1.0",
        exported_at=datetime.utcnow().isoformat(),
        data=export_data
    )


@router.post("/import")
def import_configuration(
    config: ConfigImport,
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """
    Import configuration from JSON.
    
    If overwrite=True, existing data will be replaced.
    If overwrite=False, only new items will be added.
    
    Note: User passwords are not imported for security reasons.
    """
    try:
        data = config.data
        imported_count = {
            "devices": 0,
            "tags": 0,
            "server_configs": 0,
            "system_settings": 0
        }
        
        # Import devices
        if "devices" in data:
            for device_data in data["devices"]:
                existing = db.query(Device).filter(Device.name == device_data["name"]).first()
                
                if existing and not config.overwrite:
                    continue
                elif existing and config.overwrite:
                    # Update existing
                    for key, value in device_data.items():
                        if key != "id":
                            setattr(existing, key, value)
                else:
                    # Create new
                    new_device = Device(**{k: v for k, v in device_data.items() if k != "id"})
                    db.add(new_device)
                
                imported_count["devices"] += 1
        
        # Import tags
        if "tags" in data:
            for tag_data in data["tags"]:
                existing = db.query(Tag).filter(Tag.tag_id == tag_data["tag_id"]).first()
                
                if existing and not config.overwrite:
                    continue
                elif existing and config.overwrite:
                    # Update existing
                    for key, value in tag_data.items():
                        if key != "id":
                            setattr(existing, key, value)
                else:
                    # Create new
                    new_tag = Tag(**{k: v for k, v in tag_data.items() if k != "id"})
                    db.add(new_tag)
                
                imported_count["tags"] += 1
        
        # Import server configs
        if "server_configs" in data:
            for sc_data in data["server_configs"]:
                existing = db.query(ServerConfig).filter(ServerConfig.type == sc_data["type"]).first()
                
                if existing and not config.overwrite:
                    continue
                elif existing and config.overwrite:
                    # Update existing
                    for key, value in sc_data.items():
                        if key != "id":
                            setattr(existing, key, value)
                else:
                    # Create new
                    new_sc = ServerConfig(**{k: v for k, v in sc_data.items() if k != "id"})
                    db.add(new_sc)
                
                imported_count["server_configs"] += 1
        
        # Import system settings
        if "system_settings" in data:
            for key, value in data["system_settings"].items():
                existing = db.query(SystemSettings).filter(SystemSettings.key == key).first()
                
                if existing:
                    existing.value = value
                else:
                    new_setting = SystemSettings(key=key, value=value)
                    db.add(new_setting)
                
                imported_count["system_settings"] += 1
        
        # Import storage policy
        if "storage_policy" in data and data["storage_policy"]:
            policy = db.query(StoragePolicy).first()
            if policy:
                for key, value in data["storage_policy"].items():
                    setattr(policy, key, value)
            else:
                new_policy = StoragePolicy(**data["storage_policy"])
                db.add(new_policy)
        
        db.commit()
        
        return {
            "success": True,
            "message": "Configuration imported successfully",
            "imported": imported_count
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Import failed: {str(e)}"
        )


@router.delete("/tags")
def delete_all_tags(
    current_user: User = Depends(get_current_superroot),
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
    current_user: User = Depends(get_current_superroot),
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
    current_user: User = Depends(get_current_superroot),
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
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """
    Perform a factory reset.
    
    This will:
    - Delete all tags
    - Delete all devices
    - Delete all server configurations
    - Reset storage policy to defaults
    - Reset system settings to defaults
    - Delete all users except the current superroot
    - Delete all sessions
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
        
        return {
            "success": True,
            "message": "Factory reset completed successfully",
            "deleted": {
                "tags": tag_count,
                "devices": device_count,
                "servers": server_count,
                "users": user_count,
                "sessions": session_count
            }
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Factory reset failed: {str(e)}"
        )

"""
System Settings API Endpoints

Provides endpoints for:
- Hostname management
- SSH configuration
- System update settings
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import subprocess
import os

from ...core.database import get_db
from ...core.auth import get_current_user, get_current_superroot
from ...models.user import User
from ...models.system_settings import SystemSettings


router = APIRouter()


# Pydantic models
class HostnameResponse(BaseModel):
    hostname: str


class HostnameUpdate(BaseModel):
    hostname: str


class SSHConfig(BaseModel):
    enabled: bool


class SSHKeyResponse(BaseModel):
    id: int
    name: str
    fingerprint: str
    created_at: str


class UpdateSettings(BaseModel):
    auto_update_enabled: bool
    repo_url: str


# Helper functions
def get_setting(key: str, db: Session, default: str = "") -> str:
    """Get a system setting value."""
    setting = db.query(SystemSettings).filter(SystemSettings.key == key).first()
    return setting.value if setting else default


def set_setting(key: str, value: str, db: Session):
    """Set a system setting value."""
    setting = db.query(SystemSettings).filter(SystemSettings.key == key).first()
    if setting:
        setting.value = value
    else:
        setting = SystemSettings(key=key, value=value)
        db.add(setting)
    db.commit()


# Hostname endpoints
@router.get("/hostname", response_model=HostnameResponse)
def get_hostname(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current system hostname."""
    hostname = get_setting("hostname", db, "vistaiot-gateway")
    return HostnameResponse(hostname=hostname)


@router.put("/hostname", response_model=HostnameResponse)
def set_hostname(
    hostname_data: HostnameUpdate,
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """Set system hostname (superroot only)."""
    try:
        # Update in database
        set_setting("hostname", hostname_data.hostname, db)
        
        # Try to update system hostname (may require sudo)
        try:
            subprocess.run(
                ["hostnamectl", "set-hostname", hostname_data.hostname],
                check=True,
                capture_output=True
            )
        except (subprocess.CalledProcessError, FileNotFoundError):
            # If hostnamectl fails, just update in database
            pass
        
        return HostnameResponse(hostname=hostname_data.hostname)
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to set hostname: {str(e)}"
        )


# SSH endpoints
@router.get("/ssh", response_model=SSHConfig)
def get_ssh_config(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get SSH configuration."""
    enabled = get_setting("ssh_enabled", db, "false") == "true"
    return SSHConfig(enabled=enabled)


@router.put("/ssh", response_model=SSHConfig)
def update_ssh_config(
    ssh_config: SSHConfig,
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """Update SSH configuration (superroot only)."""
    try:
        # Update in database
        set_setting("ssh_enabled", "true" if ssh_config.enabled else "false", db)
        
        # Try to enable/disable SSH service
        try:
            if ssh_config.enabled:
                subprocess.run(["systemctl", "start", "ssh"], check=True, capture_output=True)
                subprocess.run(["systemctl", "enable", "ssh"], check=True, capture_output=True)
            else:
                subprocess.run(["systemctl", "stop", "ssh"], check=True, capture_output=True)
                subprocess.run(["systemctl", "disable", "ssh"], check=True, capture_output=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            # If systemctl fails, just update in database
            pass
        
        return SSHConfig(enabled=ssh_config.enabled)
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update SSH config: {str(e)}"
        )


@router.post("/ssh/keys")
async def upload_ssh_key(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """Upload SSH private key (superroot only)."""
    try:
        # Create .ssh directory if it doesn't exist
        ssh_dir = os.path.expanduser("~/.ssh")
        os.makedirs(ssh_dir, exist_ok=True)
        
        # Save the key file
        key_path = os.path.join(ssh_dir, file.filename)
        content = await file.read()
        
        with open(key_path, "wb") as f:
            f.write(content)
        
        # Set proper permissions (600)
        os.chmod(key_path, 0o600)
        
        return {
            "success": True,
            "message": f"SSH key '{file.filename}' uploaded successfully",
            "path": key_path
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload SSH key: {str(e)}"
        )


@router.get("/ssh/keys")
def list_ssh_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List SSH keys."""
    try:
        ssh_dir = os.path.expanduser("~/.ssh")
        
        if not os.path.exists(ssh_dir):
            return []
        
        keys = []
        for filename in os.listdir(ssh_dir):
            if filename.endswith((".pub", "")) and not filename.startswith("."):
                file_path = os.path.join(ssh_dir, filename)
                if os.path.isfile(file_path):
                    stat = os.stat(file_path)
                    keys.append({
                        "name": filename,
                        "path": file_path,
                        "size": stat.st_size,
                        "modified": stat.st_mtime
                    })
        
        return keys
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list SSH keys: {str(e)}"
        )


@router.delete("/ssh/keys/{key_name}")
def delete_ssh_key(
    key_name: str,
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """Delete an SSH key (superroot only)."""
    try:
        ssh_dir = os.path.expanduser("~/.ssh")
        key_path = os.path.join(ssh_dir, key_name)
        
        # Security check: ensure the path is within .ssh directory
        if not os.path.abspath(key_path).startswith(os.path.abspath(ssh_dir)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid key name"
            )
        
        if not os.path.exists(key_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="SSH key not found"
            )
        
        os.remove(key_path)
        
        return {"success": True, "message": f"SSH key '{key_name}' deleted"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete SSH key: {str(e)}"
        )


# Update settings endpoints
class UpdateSettingsResponse(BaseModel):
    auto_update_enabled: bool
    auto_update_branch: str
    repo_url: str
    last_update_check: Optional[str]
    last_update_status: Optional[str]


class UpdateSettingsUpdate(BaseModel):
    auto_update_enabled: bool
    auto_update_branch: str
    repo_url: str


class RepositoryInfoResponse(BaseModel):
    available: bool
    current_branch: Optional[str]
    current_commit: Optional[str]
    remote_url: Optional[str]
    has_uncommitted_changes: Optional[bool]
    setup_script_exists: Optional[bool]
    message: Optional[str]


class UpdateCheckResponse(BaseModel):
    has_updates: bool
    message: str


class UpdateTriggerResponse(BaseModel):
    success: bool
    message: str


@router.get("/update", response_model=UpdateSettingsResponse)
def get_update_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get system update settings."""
    auto_update = get_setting("auto_update_enabled", db, "false") == "true"
    branch = get_setting("auto_update_branch", db, "production")
    repo_url = get_setting("update_repo_url", db, "https://github.com/yourusername/modbus-gate")
    last_check = get_setting("last_update_check", db, "")
    last_status = get_setting("last_update_status", db, "")
    
    return UpdateSettingsResponse(
        auto_update_enabled=auto_update,
        auto_update_branch=branch,
        repo_url=repo_url,
        last_update_check=last_check if last_check else None,
        last_update_status=last_status if last_status else None
    )


@router.put("/update", response_model=UpdateSettingsResponse)
def update_update_settings(
    settings: UpdateSettingsUpdate,
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """Update system update settings (superroot only)."""
    set_setting("auto_update_enabled", "true" if settings.auto_update_enabled else "false", db)
    set_setting("auto_update_branch", settings.auto_update_branch, db)
    set_setting("update_repo_url", settings.repo_url, db)
    
    return UpdateSettingsResponse(
        auto_update_enabled=settings.auto_update_enabled,
        auto_update_branch=settings.auto_update_branch,
        repo_url=settings.repo_url,
        last_update_check=get_setting("last_update_check", db, ""),
        last_update_status=get_setting("last_update_status", db, "")
    )


@router.get("/update/repository-info", response_model=RepositoryInfoResponse)
def get_repository_info(
    current_user: User = Depends(get_current_user)
):
    """Get Git repository information."""
    from ...services.auto_update_service import auto_update_service
    
    info = auto_update_service.get_repository_info()
    return RepositoryInfoResponse(**info)


@router.post("/update/check", response_model=UpdateCheckResponse)
def check_for_updates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if updates are available."""
    from ...services.auto_update_service import auto_update_service
    
    branch = get_setting("auto_update_branch", db, "production")
    has_updates, message = auto_update_service.check_for_updates(branch)
    
    # Update last check time
    from datetime import datetime
    set_setting("last_update_check", datetime.utcnow().isoformat(), db)
    
    return UpdateCheckResponse(
        has_updates=has_updates,
        message=message
    )


@router.post("/update/trigger", response_model=UpdateTriggerResponse)
async def trigger_update(
    current_user: User = Depends(get_current_superroot),
    db: Session = Depends(get_db)
):
    """Trigger a manual system update (superroot only)."""
    from ...services.auto_update_service import auto_update_service
    
    try:
        branch = get_setting("auto_update_branch", db, "production")
        
        # Perform the update
        success, message = auto_update_service.perform_update(branch, db)
        
        return UpdateTriggerResponse(
            success=success,
            message=message
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to trigger update: {str(e)}"
        )

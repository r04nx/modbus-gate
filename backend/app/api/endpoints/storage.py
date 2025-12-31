"""
Storage Policy API Endpoints

Provides endpoints for:
- Getting storage policy configuration
- Updating storage policy
- Getting current storage usage
- Managing buffered data files
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import os
import shutil

from ...core.database import get_db
from ...core.auth import get_current_user
from ...models.user import User
from ...models.storage_policy import StoragePolicy, PolicyType, TimeUnit
from ...services.buffering_service import buffering_service


router = APIRouter()


class StoragePolicyResponse(BaseModel):
    enabled: bool
    policy_type: Optional[PolicyType]
    storage_threshold_percent: Optional[int]
    time_value: Optional[int]
    time_unit: Optional[TimeUnit]
    northbound_interface: Optional[str]

    class Config:
        from_attributes = True


class StoragePolicyUpdate(BaseModel):
    enabled: bool
    policy_type: Optional[PolicyType] = None
    storage_threshold_percent: Optional[int] = None
    time_value: Optional[int] = None
    time_unit: Optional[TimeUnit] = None
    northbound_interface: Optional[str] = None
    auto_cleanup_enabled: Optional[bool] = None
    cleanup_time: Optional[str] = None
    log_retention_enabled: Optional[bool] = None
    log_retention_days: Optional[int] = None


class StorageUsageResponse(BaseModel):
    total_bytes: int
    used_bytes: int
    free_bytes: int
    percent_used: float
    database_size_bytes: int
    buffer_db_size_bytes: int


class BufferedFileResponse(BaseModel):
    outage_id: int
    filename: str
    label: str
    start_time: str
    end_time: Optional[str]
    is_active: bool
    record_count: int
    size: int
    size_mb: float


@router.get("/policy", response_model=StoragePolicyResponse)
def get_storage_policy(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current storage policy configuration."""
    policy = db.query(StoragePolicy).first()
    
    if not policy:
        # Create default policy if none exists
        policy = StoragePolicy(
            enabled=False,
            policy_type=PolicyType.STORAGE,
            storage_threshold_percent=80,
            time_value=7,
            time_unit=TimeUnit.DAYS
        )
        db.add(policy)
        db.commit()
        db.refresh(policy)
    
    return policy


@router.put("/policy", response_model=StoragePolicyResponse)
def update_storage_policy(
    policy_data: StoragePolicyUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update storage policy configuration."""
    policy = db.query(StoragePolicy).first()
    
    if not policy:
        # Create new policy
        policy = StoragePolicy(**policy_data.dict())
        db.add(policy)
    else:
        # Update existing policy
        for key, value in policy_data.dict().items():
            setattr(policy, key, value)
    
    db.commit()
    db.refresh(policy)
    
    # Update System Cron
    update_cron_job(policy)
    
    return policy


@router.get("/usage", response_model=StorageUsageResponse)
def get_storage_usage(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current storage usage statistics."""
    try:
        # Get disk usage for the current directory
        stat = shutil.disk_usage(".")
        
        # Get main database file size
        db_paths = ["vistaiot.db", "backend/vistaiot.db", "/opt/modbus-gate/backend/vistaiot.db"]
        db_size = 0
        for path in db_paths:
            if os.path.exists(path):
                db_size = os.path.getsize(path)
                break
        
        # Get buffer database file size
        buffer_db_path = "/opt/modbus-gate/buffer.db"
        buffer_db_size = 0
        if os.path.exists(buffer_db_path):
            buffer_db_size = os.path.getsize(buffer_db_path)
        
        return StorageUsageResponse(
            total_bytes=stat.total,
            used_bytes=stat.used,
            free_bytes=stat.free,
            percent_used=(stat.used / stat.total) * 100,
            database_size_bytes=db_size,
            buffer_db_size_bytes=buffer_db_size
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get storage usage: {str(e)}"
        )


# Buffered Data File Management Endpoints

@router.get("/buffered-files", response_model=List[BufferedFileResponse])
def list_buffered_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all buffered CSV files from network outages."""
    try:
        files = buffering_service.get_buffered_files(db)
        return files
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list buffered files: {str(e)}"
        )


@router.get("/buffered-files/{filename}")
def download_buffered_file(
    filename: str,
    current_user: User = Depends(get_current_user)
):
    """Download a specific buffered CSV file."""
    # Get file path (validates filename and prevents directory traversal)
    filepath = buffering_service.get_file_path(filename)
    
    if not filepath:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    return FileResponse(
        path=str(filepath),
        filename=filename,
        media_type="text/csv"
    )


@router.post("/manual-cleanup")
def manual_cleanup(
    clean_journal: bool = True,
    clean_app_logs: bool = True,
    clean_apt_cache: bool = True,
    current_user: User = Depends(get_current_user)
):
    """Trigger manual system cleanup with granular control and detailed stats."""
    try:
        import subprocess
        import shutil
        
        # Measure initial space
        initial_stat = shutil.disk_usage("/")
        details = []
        
        if clean_journal:
            # Vacuum Journal
            subprocess.run(["journalctl", "--vacuum-size=50M"], capture_output=True)
            details.append("Vacuumed system journal to 50MB limit")
            
        if clean_app_logs:
            # Clean old archives
            subprocess.run("find /var/log -type f -name '*.gz' -delete", shell=True)
            subprocess.run("find /var/log -type f -name '*.1' -delete", shell=True)
            # Truncate active large logs
            subprocess.run("find /var/log -type f -size +50M -name '*.log' -exec truncate -s 0 {} \\;", shell=True)
            details.append("Removed old log archives and truncated oversized logs")
            
        if clean_apt_cache:
            subprocess.run(["apt-get", "clean"], capture_output=True)
            subprocess.run(["apt-get", "autoremove", "-y"], capture_output=True)
            details.append("Cleared APT package cache and unused dependencies")
            
        # Measure final space
        final_stat = shutil.disk_usage("/")
        freed_bytes = final_stat.free - initial_stat.free
        
        # Ensure we don't show negative freed space if something else wrote to disk simultaneously
        if freed_bytes < 0:
            freed_bytes = 0

        return {
            "success": True,
            "message": "Cleanup completed",
            "initial_free_bytes": initial_stat.free,
            "final_free_bytes": final_stat.free,
            "freed_bytes": freed_bytes,
            "details": details
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def update_cron_job(policy: StoragePolicy):
    """Update crontab based on policy."""
    import subprocess
    CRON_FILE = "/etc/cron.d/vistaiot-cleanup"
    SCRIPT_PATH = "/root/modbus-gate/backend/scripts/check_and_clean.sh"
    
    if not policy.auto_cleanup_enabled:
        if os.path.exists(CRON_FILE):
            os.remove(CRON_FILE)
        return

    # Parse Time (Default 03:00)
    try:
        hour, minute = policy.cleanup_time.split(':')
    except:
        hour, minute = "03", "00"
        
    # Determine schedule
    schedule = f"{minute} {hour} * * *" # Daily
    if policy.cleanup_schedule == 'weekly':
        schedule = f"{minute} {hour} * * 0" # Weekly on Sunday

    # Log Retention Params
    retention_days = policy.log_retention_days if policy.log_retention_enabled else 0
    retention_flag = "1" if policy.log_retention_enabled else "0"

    # Create cron content with retention args
    # Args: THRESHOLD RETENTION_ENABLED RETENTION_DAYS
    cron_content = f"{schedule} root {SCRIPT_PATH} {policy.cleanup_threshold} {retention_flag} {retention_days}\n"
    
    # Write to temp file then move (needs root)
    # We assume the service runs as root or has permission
    try:
        with open("/tmp/vistaiot-cleanup", "w") as f:
            f.write(cron_content)
        subprocess.run(["mv", "/tmp/vistaiot-cleanup", CRON_FILE], check=True)
        subprocess.run(["chmod", "644", CRON_FILE], check=True)
    except Exception as e:
        print(f"Error updating cron: {e}")

@router.put("/policy", response_model=StoragePolicyResponse)
def update_storage_policy(
    policy_data: StoragePolicyUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update storage policy configuration."""
    policy = db.query(StoragePolicy).first()
    
    if not policy:
        # Create new policy
        policy = StoragePolicy(**policy_data.dict())
        db.add(policy)
    else:
        # Update existing policy
        for key, value in policy_data.dict().items():
            setattr(policy, key, value)
    
    db.commit()
    db.refresh(policy)
    
    # Update System Cron
    update_cron_job(policy)
    
    return policy

@router.delete("/buffered-files/{filename}")
def delete_buffered_file(
    filename: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a buffered CSV file."""
    from ...models.outage import Outage
    
    # Find outage by filename
    outage = db.query(Outage).filter(Outage.csv_filename == filename).first()
    
    if not outage:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    # Get file path
    filepath = buffering_service.get_file_path(filename)
    
    # Delete file if it exists
    if filepath and filepath.exists():
        filepath.unlink()
    
    # Delete outage record
    db.delete(outage)
    db.commit()
    
    return {"success": True, "message": f"File {filename} deleted"}


@router.post("/buffered-files/cleanup")
def cleanup_old_buffered_files(
    max_age_days: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove buffered files older than specified age."""
    try:
        import asyncio
        asyncio.run(buffering_service.cleanup_old_files(db, max_age_days))
        return {"success": True, "message": f"Cleaned up files older than {max_age_days} days"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cleanup files: {str(e)}"
        )

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


class StorageUsageResponse(BaseModel):
    total_bytes: int
    used_bytes: int
    free_bytes: int
    percent_used: float
    database_size_bytes: int


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
        
        # Get database file size
        db_paths = ["vistaiot.db", "backend/vistaiot.db", "/opt/modbus-gate/backend/vistaiot.db"]
        db_size = 0
        for path in db_paths:
            if os.path.exists(path):
                db_size = os.path.getsize(path)
                break
        
        return StorageUsageResponse(
            total_bytes=stat.total,
            used_bytes=stat.used,
            free_bytes=stat.free,
            percent_used=(stat.used / stat.total) * 100,
            database_size_bytes=db_size
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

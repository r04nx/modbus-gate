"""
Storage Policy API Endpoints

Provides endpoints for:
- Getting storage policy configuration
- Updating storage policy
- Getting current storage usage
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import os
import shutil

from ...core.database import get_db
from ...core.auth import get_current_user
from ...models.user import User
from ...models.storage_policy import StoragePolicy, PolicyType, TimeUnit


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
        db_path = "backend/vistaiot.db"
        db_size = os.path.getsize(db_path) if os.path.exists(db_path) else 0
        
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

"""
DataStore API Endpoints
========================
Provides REST endpoints for DataStore configuration, querying records,
statistics, CSV export, and targeted deletion.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.datastore import DataStoreConfig, DataStoreRecord
from app.models.user import User
from app.services.datastore_service import datastore_service

router = APIRouter()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class DataStoreConfigOut(BaseModel):
    enabled: bool
    included_tags: List[str]
    sample_interval: int

    class Config:
        from_attributes = True


class DataStoreConfigIn(BaseModel):
    enabled: Optional[bool] = None
    included_tags: Optional[List[str]] = None
    sample_interval: Optional[int] = Field(None, ge=1, le=3600,
                                            description="Sampling interval in seconds (1–3600)")


class DataStoreRecordOut(BaseModel):
    id: int
    tag_id: str
    value: Optional[str]
    quality: str
    timestamp: float

    class Config:
        from_attributes = True


class DeleteResult(BaseModel):
    deleted: int
    message: str


class StatsOut(BaseModel):
    total_rows: int
    tag_count: int
    oldest_timestamp: Optional[float]
    newest_timestamp: Optional[float]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_or_create_config(db: Session) -> DataStoreConfig:
    cfg = db.query(DataStoreConfig).filter(DataStoreConfig.id == 1).first()
    if cfg is None:
        cfg = DataStoreConfig(id=1, enabled=False, included_tags=[], sample_interval=1)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/config", response_model=DataStoreConfigOut)
async def get_config(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the current DataStore configuration."""
    return _get_or_create_config(db)


@router.put("/config", response_model=DataStoreConfigOut)
async def update_config(
    payload: DataStoreConfigIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update DataStore configuration (partial update — only send fields you want to change)."""
    cfg = _get_or_create_config(db)

    if payload.enabled is not None:
        cfg.enabled = payload.enabled
    if payload.included_tags is not None:
        cfg.included_tags = payload.included_tags
    if payload.sample_interval is not None:
        cfg.sample_interval = payload.sample_interval

    try:
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed to update DataStore config: {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to update configuration: {str(exc)}")

    # Notify background service to pick up change immediately
    datastore_service.signal_config_reload()
    return cfg


@router.get("/tags", response_model=List[str])
async def get_stored_tags(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the list of tag IDs that have stored records."""
    return datastore_service.get_distinct_tags(db)


@router.get("/records", response_model=List[DataStoreRecordOut])
async def get_records(
    tag_ids: Optional[List[str]] = Query(None, description="Filter by one or more tag IDs"),
    start_time: Optional[float] = Query(None, description="Start of time range (unix epoch seconds)"),
    end_time: Optional[float] = Query(None, description="End of time range (unix epoch seconds)"),
    limit: int = Query(5000, ge=1, le=50000, description="Maximum number of records to return"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Query stored records with optional tag and time filters."""
    try:
        records = datastore_service.get_records(db, tag_ids, start_time, end_time, limit)
        return records
    except Exception as exc:
        logger.error(f"Failed to query DataStore records: {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to query records: {str(exc)}")


@router.get("/stats", response_model=StatsOut)
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return storage statistics: row count, tag count, time range."""
    try:
        return datastore_service.get_stats(db)
    except Exception as exc:
        logger.error(f"Failed to get DataStore stats: {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to get statistics: {str(exc)}")


@router.get("/export")
async def export_csv(
    tag_ids: Optional[List[str]] = Query(None),
    start_time: Optional[float] = Query(None),
    end_time: Optional[float] = Query(None),
    limit: int = Query(100000, ge=1, le=500000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export records as a CSV file download."""
    try:
        csv_content = datastore_service.export_csv(db, tag_ids, start_time, end_time, limit)

        def iterfile():
            yield csv_content.encode("utf-8")

        return StreamingResponse(
            iterfile(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=datastore_export.csv"},
        )
    except Exception as exc:
        logger.error(f"Failed to export DataStore records: {exc}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(exc)}")


@router.delete("/records", response_model=DeleteResult)
async def delete_records(
    tag_ids: Optional[List[str]] = Query(None, description="Tag IDs to delete (all if omitted)"),
    start_time: Optional[float] = Query(None, description="Delete records after this timestamp"),
    end_time: Optional[float] = Query(None, description="Delete records before this timestamp"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete stored records with optional filters.
    WARNING: Passing no filters will delete ALL records.
    """
    try:
        deleted = datastore_service.delete_records(db, tag_ids, start_time, end_time)
        return DeleteResult(deleted=deleted, message=f"Successfully deleted {deleted} record(s).")
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed to delete DataStore records: {exc}")
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(exc)}")

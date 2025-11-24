from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Dict, List, Optional
import io
import csv
from app.services.buffering_service import buffering_service
from app.core.auth import get_current_user
from app.models.user import User

router = APIRouter()

class BufferingConfig(BaseModel):
    internet_trigger: bool
    gateway_trigger: bool
    mqtt_trigger: bool

class BufferingStatus(BaseModel):
    active: bool
    triggers: Dict[str, bool]
    config: BufferingConfig

@router.get("/status", response_model=BufferingStatus)
def get_status(current_user: User = Depends(get_current_user)):
    """Get current buffering status and configuration."""
    return buffering_service.get_status()

@router.put("/config", response_model=BufferingStatus)
def update_config(config: BufferingConfig, current_user: User = Depends(get_current_user)):
    """Update buffering trigger configuration."""
    buffering_service.update_config(config.model_dump())
    return buffering_service.get_status()

@router.post("/manual/{action}")
def manual_control(action: str, current_user: User = Depends(get_current_user)):
    """Start or stop manual buffering."""
    if action == "start":
        buffering_service.set_manual_trigger(True)
    elif action == "stop":
        buffering_service.set_manual_trigger(False)
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'start' or 'stop'.")
    return {"success": True, "status": buffering_service.get_status()}

@router.get("/data")
def get_data(
    tag_id: Optional[str] = None,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None,
    limit: int = 1000,
    current_user: User = Depends(get_current_user)
):
    """Query buffered data."""
    data = buffering_service.query_data(tag_id, start_time, end_time, limit)
    return data

@router.get("/tags")
def get_buffered_tags(current_user: User = Depends(get_current_user)):
    """Get list of unique tag IDs that have buffered data."""
    tags = buffering_service.get_buffered_tags()
    return tags

@router.get("/export")
def export_data(
    tag_id: Optional[str] = None,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None,
    current_user: User = Depends(get_current_user)
):
    """Export buffered data as CSV."""
    data = buffering_service.query_data(tag_id, start_time, end_time, limit=100000)
    
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["timestamp", "tag_id", "value", "quality"])
    writer.writeheader()
    
    for row in data:
        # Convert timestamp to readable format
        from datetime import datetime
        row["timestamp"] = datetime.fromtimestamp(row["timestamp"]).isoformat()
        writer.writerow(row)
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=buffered_data.csv"}
    )

@router.delete("/data")
def clear_data(current_user: User = Depends(get_current_user)):
    """Clear all buffered data."""
    success = buffering_service.clear_data()
    if not success:
        raise HTTPException(status_code=500, detail="Failed to clear data")
    return {"success": True, "message": "Buffered data cleared"}

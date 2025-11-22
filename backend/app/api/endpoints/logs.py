from fastapi import APIRouter, Query
from typing import List, Dict, Optional
from app.core.log_handler import memory_handler

router = APIRouter()

@router.get("/", response_model=List[Dict])
def get_logs(
    level: Optional[str] = Query(None, description="Filter by log level: ERROR, WARNING, INFO, DEBUG, or ALL"),
    limit: Optional[int] = Query(500, description="Maximum number of logs to return")
):
    """
    Retrieve application logs with optional filtering
    """
    return memory_handler.get_logs(level=level, limit=limit)

@router.delete("/")
def clear_logs():
    """
    Clear all stored logs
    """
    memory_handler.clear_logs()
    return {"message": "Logs cleared successfully"}

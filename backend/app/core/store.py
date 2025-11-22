import asyncio
import time
from typing import Dict, Any, Optional, List
from datetime import datetime
from pydantic import BaseModel

class TagValue(BaseModel):
    value: Any
    timestamp: float
    quality: str = "GOOD" # GOOD, BAD, UNCERTAIN
    error_message: Optional[str] = None

class GlobalDataStore:
    _instance = None
    _lock = asyncio.Lock()
    _data: Dict[str, TagValue] = {} # tag_id -> TagValue
    _history: Dict[str, List[float]] = {} # tag_id -> list of recent values

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(GlobalDataStore, cls).__new__(cls)
        return cls._instance

    @classmethod
    async def update_tag(cls, tag_id: str, value: Any, quality: str = "GOOD", error_message: Optional[str] = None):
        async with cls._lock:
            if tag_id in cls._data:
                cls._data[tag_id].value = value
                cls._data[tag_id].quality = quality
                cls._data[tag_id].error_message = error_message
                cls._data[tag_id].timestamp = time.time()
                
                # Update history for sparklines (only for numeric values with GOOD quality)
                if quality == "GOOD" and value is not None:
                    try:
                        numeric_value = float(value)
                        if tag_id not in cls._history:
                            cls._history[tag_id] = []
                        cls._history[tag_id].append(numeric_value)
                        # Keep only last 20 values for sparkline
                        if len(cls._history[tag_id]) > 20:
                            cls._history[tag_id] = cls._history[tag_id][-20:]
                    except (ValueError, TypeError):
                        pass  # Not a numeric value, skip history
            else:
                cls._data[tag_id] = TagValue(
                    value=value,
                    timestamp=time.time(),
                    quality=quality,
                    error_message=error_message
                )

    @classmethod
    async def get_tag(cls, tag_id: str) -> Optional[TagValue]:
        async with cls._lock:
            return cls._data.get(tag_id)

    @classmethod
    async def get_all_tags(cls) -> Dict[str, TagValue]:
        async with cls._lock:
            return cls._data.copy()

    @classmethod
    async def delete_tag(cls, tag_id: str):
        async with cls._lock:
            if tag_id in cls._data:
                del cls._data[tag_id]
            if tag_id in cls._history: # Also delete from history
                del cls._history[tag_id]

    @classmethod
    async def get_tag_history(cls, tag_id: str) -> List[float]:
        async with cls._lock:
            return cls._history.get(tag_id, [])

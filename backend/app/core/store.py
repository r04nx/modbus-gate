import threading
import time
from typing import Dict, Any, Optional, List
from datetime import datetime
from pydantic import BaseModel

class TagValue(BaseModel):
    value: Any
    timestamp: float
    quality: str = "GOOD" # GOOD, BAD, UNCERTAIN
    error_message: Optional[str] = None
    history: List[Dict[str, Any]] = [] # List of {timestamp, value}

class GlobalDataStore:
    _instance = None
    _lock = threading.Lock()
    _data: Dict[str, TagValue] = {} # tag_id -> TagValue
    _history: Dict[str, List[Dict[str, Any]]] = {} # tag_id -> list of {timestamp, value}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(GlobalDataStore, cls).__new__(cls)
        return cls._instance

    @classmethod
    async def update_tag(cls, tag_id: str, value: Any, quality: str = "GOOD", error_message: Optional[str] = None):
        with cls._lock:
            current_time = time.time()
            
            # Update history for sparklines (only for numeric values with GOOD quality)
            if quality == "GOOD" and value is not None:
                try:
                    numeric_value = float(value)
                    if tag_id not in cls._history:
                        cls._history[tag_id] = []
                    
                    cls._history[tag_id].append({
                        "timestamp": current_time,
                        "value": numeric_value
                    })
                    
                    # Keep last 3600 values (approx 1 hour at 1 sec interval)
                    if len(cls._history[tag_id]) > 3600:
                        cls._history[tag_id] = cls._history[tag_id][-3600:]
                except (ValueError, TypeError):
                    pass  # Not a numeric value, skip history

            if tag_id in cls._data:
                cls._data[tag_id].value = value
                cls._data[tag_id].quality = quality
                cls._data[tag_id].error_message = error_message
                cls._data[tag_id].timestamp = current_time
                # We don't store history in _data directly to save memory, 
                # it's injected when retrieving
            else:
                cls._data[tag_id] = TagValue(
                    value=value,
                    timestamp=current_time,
                    quality=quality,
                    error_message=error_message
                )

    @classmethod
    async def get_tag(cls, tag_id: str) -> Optional[TagValue]:
        with cls._lock:
            return cls._data.get(tag_id)

    @classmethod
    async def get_all_tags(cls, history_limit: int = 60) -> Dict[str, TagValue]:
        with cls._lock:
            # Create a copy and inject history
            result = {}
            for tag_id, tag_val in cls._data.items():
                # Create a new instance to avoid modifying the stored one
                new_val = tag_val.model_copy()
                if tag_id in cls._history:
                    # Apply history limit
                    history = cls._history[tag_id]
                    if history_limit > 0 and len(history) > history_limit:
                        new_val.history = history[-history_limit:]
                    else:
                        new_val.history = history
                result[tag_id] = new_val
            return result

    @classmethod
    async def delete_tag(cls, tag_id: str):
        with cls._lock:
            if tag_id in cls._data:
                del cls._data[tag_id]
            if tag_id in cls._history: # Also delete from history
                del cls._history[tag_id]

    @classmethod
    async def get_tag_history(cls, tag_id: str) -> List[float]:
        with cls._lock:
            return cls._history.get(tag_id, [])

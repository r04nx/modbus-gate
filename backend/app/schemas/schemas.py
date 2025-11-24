from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

# Device Schemas
class DeviceBase(BaseModel):
    name: str
    description: Optional[str] = None
    type: str
    connection_params: Dict[str, Any]
    enabled: bool = True
    polling_interval: int = 1000

class DeviceCreate(DeviceBase):
    pass

class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    connection_params: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None
    polling_interval: Optional[int] = None

class Device(DeviceBase):
    id: int
    
    class Config:
        from_attributes = True

# Tag Schemas
class TagBase(BaseModel):
    tag_id: str
    name: str
    description: Optional[str] = None
    type: str
    device_id: Optional[int] = None
    address: Optional[str] = None
    data_type: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    initial_value: Optional[str] = None
    calculation_formula: Optional[str] = None
    variable_mappings: Optional[Dict[str, str]] = None  # {"A": "tag_id_1", "B": "tag_id_2"}
    fallback_type: str = 'last_success'  # 'last_success' or 'default'
    fallback_value: Optional[str] = None
    enabled: bool = True

class TagCreate(TagBase):
    pass

class TagUpdate(BaseModel):
    tag_id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    device_id: Optional[int] = None
    address: Optional[str] = None
    data_type: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    initial_value: Optional[str] = None
    calculation_formula: Optional[str] = None
    variable_mappings: Optional[Dict[str, str]] = None
    fallback_type: Optional[str] = None
    fallback_value: Optional[str] = None
    enabled: Optional[bool] = None


class Tag(TagBase):
    id: int
    
    class Config:
        from_attributes = True

# Real-time Data Schema
class TagValueResponse(BaseModel):
    value: Any
    timestamp: datetime
    quality: str
    error_message: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = None # List of {timestamp, value}

# Tag Write Schema
class TagWrite(BaseModel):
    value: Any  # Value to write to the tag

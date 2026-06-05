from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
import re

# Device Schemas
class DeviceBase(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    type: str
    connection_params: Dict[str, Any]
    enabled: bool = True
    polling_interval: int = 1000

    @field_validator('name')
    def name_must_not_contain_colons(cls, v):
        if ':' in v:
            raise ValueError('Name must not contain colons')
        return v

class DeviceCreate(DeviceBase):
    pass

class DeviceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    type: Optional[str] = None
    connection_params: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None
    polling_interval: Optional[int] = None

    @field_validator('name')
    def name_must_not_contain_colons(cls, v):
        if v is not None and ':' in v:
            raise ValueError('Name must not contain colons')
        return v

class Device(DeviceBase):
    id: int
    
    class Config:
        from_attributes = True

# Tag Schemas
class TagBase(BaseModel):
    tag_id: str
    name: str = Field(..., min_length=1)
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

    @field_validator('name')
    def name_must_not_contain_colons(cls, v):
        if ':' in v:
            raise ValueError('Name must not contain colons')
        return v

class TagCreate(TagBase):
    pass

class TagUpdate(BaseModel):
    tag_id: Optional[str] = None
    name: Optional[str] = Field(None, min_length=1)
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

    @field_validator('name')
    def name_must_not_contain_colons(cls, v):
        if v is not None and ':' in v:
            raise ValueError('Name must not contain colons')
        return v

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

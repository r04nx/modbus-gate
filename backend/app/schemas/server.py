from pydantic import BaseModel
from typing import Optional, Dict, Any

class ServerConfigBase(BaseModel):
    type: str
    enabled: bool = False
    config: Dict[str, Any] = {}

class ServerConfigCreate(ServerConfigBase):
    pass

class ServerConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None

class ServerConfig(ServerConfigBase):
    id: int

    class Config:
        from_attributes = True

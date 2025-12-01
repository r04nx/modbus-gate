from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime

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

class CertificateBase(BaseModel):
    name: str
    description: Optional[str] = None

class CertificateResponse(CertificateBase):
    id: int
    has_ca_cert: bool = False
    has_client_cert: bool = False
    has_client_key: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
    
    @classmethod
    def from_orm(cls, obj):
        # Custom from_orm to add computed fields
        data = {
            "id": obj.id,
            "name": obj.name,
            "description": obj.description,
            "has_ca_cert": obj.ca_cert is not None,
            "has_client_cert": obj.client_cert is not None,
            "has_client_key": obj.client_key is not None,
            "created_at": obj.created_at,
            "updated_at": obj.updated_at
        }
        return cls(**data)


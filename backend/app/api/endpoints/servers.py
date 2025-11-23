from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.models import models
from app.schemas import server as schemas

router = APIRouter()

@router.get("/", response_model=List[schemas.ServerConfig])
def read_servers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    servers = db.query(models.ServerConfig).offset(skip).limit(limit).all()
    return servers

@router.get("/{type}", response_model=schemas.ServerConfig)
def read_server(type: str, db: Session = Depends(get_db)):
    server = db.query(models.ServerConfig).filter(models.ServerConfig.type == type).first()
    if not server:
        # Create default if not exists
        server = models.ServerConfig(type=type, enabled=False, config={})
        db.add(server)
        db.commit()
        db.refresh(server)
    return server

@router.put("/{type}", response_model=schemas.ServerConfig)
def update_server(type: str, server_update: schemas.ServerConfigUpdate, db: Session = Depends(get_db)):
    server = db.query(models.ServerConfig).filter(models.ServerConfig.type == type).first()
    if not server:
        server = models.ServerConfig(type=type, enabled=False, config={})
        db.add(server)
    
    update_data = server_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(server, key, value)
    
    db.add(server)
    db.commit()
    db.refresh(server)
    return server

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import base64
from datetime import datetime

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models import models
from app.models.user import User
from app.schemas import server as schemas
from app.services.mqtt_publisher import get_broker_statuses

router = APIRouter()

@router.get("/MQTT_PUBLISHER/broker-status")
def mqtt_broker_status(current_user: User = Depends(get_current_user)):
    """Return live MQTT broker connection states from the publisher service."""
    return get_broker_statuses()


@router.get("/", response_model=List[schemas.ServerConfig])
def read_servers(skip: int = 0, limit: int = 100, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    servers = db.query(models.ServerConfig).offset(skip).limit(limit).all()
    return servers

@router.get("/{type}", response_model=schemas.ServerConfig)
def read_server(type: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    server = db.query(models.ServerConfig).filter(models.ServerConfig.type == type).first()
    if not server:
        # Create default if not exists
        server = models.ServerConfig(type=type, enabled=False, config={})
        db.add(server)
        db.commit()
        db.refresh(server)
    return server

@router.put("/{type}", response_model=schemas.ServerConfig)
def update_server(type: str, server_update: schemas.ServerConfigUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    server = db.query(models.ServerConfig).filter(models.ServerConfig.type == type).first()
    if not server:
        server = models.ServerConfig(type=type, enabled=False, config={})
        db.add(server)
    
    update_data = server_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == 'config' and value is None:
            continue # Don't allow setting config to None
        setattr(server, key, value)
    
    db.add(server)
    db.commit()
    db.refresh(server)
    return server

# Certificate Management Endpoints

@router.post("/certificates", response_model=schemas.CertificateResponse)
async def upload_certificate(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    ca_cert: Optional[UploadFile] = File(None),
    client_cert: Optional[UploadFile] = File(None),
    client_key: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload TLS/SSL certificates for MQTT or other secure connections.
    Files should be in PEM format.
    """
    # Check if certificate with this name already exists
    existing = db.query(models.Certificate).filter(models.Certificate.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Certificate with name '{name}' already exists")
    
    # Read certificate files
    ca_cert_data = await ca_cert.read() if ca_cert else None
    client_cert_data = await client_cert.read() if client_cert else None
    client_key_data = await client_key.read() if client_key else None
    
    # Validate PEM format (basic check)
    if ca_cert_data and not (b'BEGIN CERTIFICATE' in ca_cert_data or b'BEGIN TRUSTED CERTIFICATE' in ca_cert_data):
        raise HTTPException(status_code=400, detail="CA certificate must be in PEM format")
    if client_cert_data and b'BEGIN CERTIFICATE' not in client_cert_data:
        raise HTTPException(status_code=400, detail="Client certificate must be in PEM format")
    if client_key_data and b'BEGIN' not in client_key_data:
        raise HTTPException(status_code=400, detail="Client key must be in PEM format")
    
    # Create certificate record
    cert = models.Certificate(
        name=name,
        description=description,
        ca_cert=ca_cert_data,
        client_cert=client_cert_data,
        client_key=client_key_data
    )
    
    db.add(cert)
    db.commit()
    db.refresh(cert)
    
    return cert

@router.get("/certificates", response_model=List[schemas.CertificateResponse])
def list_certificates(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List all stored certificates (without exposing the actual certificate data)"""
    certs = db.query(models.Certificate).all()
    return certs

@router.get("/certificates/{cert_id}", response_model=schemas.CertificateResponse)
def get_certificate(cert_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get certificate information"""
    cert = db.query(models.Certificate).filter(models.Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    return cert

@router.get("/certificates/{cert_id}/info")
def get_certificate_info(cert_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get detailed certificate information including file sizes"""
    cert = db.query(models.Certificate).filter(models.Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    
    return {
        "id": cert.id,
        "name": cert.name,
        "description": cert.description,
        "has_ca_cert": cert.ca_cert is not None,
        "has_client_cert": cert.client_cert is not None,
        "has_client_key": cert.client_key is not None,
        "ca_cert_size": len(cert.ca_cert) if cert.ca_cert else 0,
        "client_cert_size": len(cert.client_cert) if cert.client_cert else 0,
        "client_key_size": len(cert.client_key) if cert.client_key else 0,
        "created_at": cert.created_at,
        "updated_at": cert.updated_at
    }

@router.put("/certificates/{cert_id}", response_model=schemas.CertificateResponse)
async def update_certificate(
    cert_id: int,
    description: Optional[str] = Form(None),
    ca_cert: Optional[UploadFile] = File(None),
    client_cert: Optional[UploadFile] = File(None),
    client_key: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an existing certificate"""
    cert = db.query(models.Certificate).filter(models.Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    
    # Update description if provided
    if description is not None:
        cert.description = description
    
    # Update certificate files if provided
    if ca_cert:
        ca_cert_data = await ca_cert.read()
        if b'BEGIN CERTIFICATE' not in ca_cert_data and b'BEGIN TRUSTED CERTIFICATE' not in ca_cert_data:
            raise HTTPException(status_code=400, detail="CA certificate must be in PEM format")
        cert.ca_cert = ca_cert_data
    
    if client_cert:
        client_cert_data = await client_cert.read()
        if b'BEGIN CERTIFICATE' not in client_cert_data:
            raise HTTPException(status_code=400, detail="Client certificate must be in PEM format")
        cert.client_cert = client_cert_data
    
    if client_key:
        client_key_data = await client_key.read()
        if b'BEGIN' not in client_key_data:
            raise HTTPException(status_code=400, detail="Client key must be in PEM format")
        cert.client_key = client_key_data
    
    cert.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(cert)
    
    return cert

@router.delete("/certificates/{cert_id}")
def delete_certificate(cert_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a certificate"""
    cert = db.query(models.Certificate).filter(models.Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    
    # Check if certificate is in use by any MQTT broker
    mqtt_config = db.query(models.ServerConfig).filter(
        models.ServerConfig.type == "MQTT_PUBLISHER"
    ).first()
    
    if mqtt_config and mqtt_config.config:
        brokers = mqtt_config.config.get("brokers", [])
        for broker in brokers:
            if broker.get("certificate_id") == cert_id:
                broker_info = f"{broker.get('host', 'Unknown Host')}:{broker.get('port', 'Unknown Port')}"
                raise HTTPException(
                    status_code=400,
                    detail=f"Certificate is in use by MQTT broker at {broker_info} (ID: {broker.get('id')}). Please remove this broker configuration first."
                )
    
    db.delete(cert)
    db.commit()
    
    return {"message": "Certificate deleted successfully"}


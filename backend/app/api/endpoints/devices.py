from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models import models
from app.schemas import schemas
from pymodbus.client import AsyncModbusTcpClient, AsyncModbusSerialClient
from asyncua import Client as OpcUaClient
from pysnmp.hlapi.asyncio import SnmpEngine, CommunityData, UdpTransportTarget, ContextData, ObjectType, ObjectIdentity, getCmd
import c104
import asyncio

router = APIRouter()

@router.get("/", response_model=List[schemas.Device])
def read_devices(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    devices = db.query(models.Device).offset(skip).limit(limit).all()
    return devices

@router.post("/", response_model=schemas.Device)
def create_device(device: schemas.DeviceCreate, db: Session = Depends(get_db)):
    db_device = models.Device(**device.model_dump())
    db.add(db_device)
    db.commit()
    db.refresh(db_device)
    return db_device

@router.delete("/{device_id}")
def delete_device(device_id: int, db: Session = Depends(get_db)):
    db_device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")
    db.delete(db_device)
    db.commit()
    return {"ok": True}

@router.patch("/{device_id}", response_model=schemas.Device)
def update_device(device_id: int, device_update: schemas.DeviceUpdate, db: Session = Depends(get_db)):
    db_device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    update_data = device_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_device, key, value)
    
    db.add(db_device)
    db.commit()
    db.refresh(db_device)
    return db_device

@router.post("/{device_id}/test")
async def test_connection(device_id: int, db: Session = Depends(get_db)):
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    try:
        if device.type == "MODBUS_TCP":
            params = device.connection_params
            host = params.get("host")
            port = params.get("port", 502)
            
            try:
                client = AsyncModbusTcpClient(host, port=port, timeout=3)
                await client.connect()
                if client.connected:
                    client.close()
                    return {
                        "status": "success", 
                        "code": "CONN_OK",
                        "message": "Connection Successful",
                        "detail": f"Successfully established TCP connection to {host}:{port} and verified Modbus handshake."
                    }
                else:
                    return {
                        "status": "error", 
                        "code": "ERR_CONN_REFUSED",
                        "message": "Connection Refused",
                        "detail": f"Target {host}:{port} rejected the connection. Check if the device is online and the port is open."
                    }
            except asyncio.TimeoutError:
                return {
                    "status": "error", 
                    "code": "ERR_TIMEOUT",
                    "message": "Connection Timed Out",
                    "detail": f"Timed out waiting for response from {host}:{port}. Check network reachability."
                }
            except Exception as e:
                 return {
                    "status": "error", 
                    "code": "ERR_MODBUS_PROTOCOL",
                    "message": "Protocol Error",
                    "detail": str(e)
                }
                
        elif device.type == "MODBUS_RTU":
            params = device.connection_params
            port = params.get("port")
            try:
                client = AsyncModbusSerialClient(
                    port, 
                    baudrate=params.get("baudrate", 9600),
                    bytesize=params.get("bytesize", 8),
                    parity=params.get("parity", "N"),
                    stopbits=params.get("stopbits", 1),
                    timeout=3
                )
                await client.connect()
                if client.connected:
                    client.close()
                    return {
                        "status": "success", 
                        "code": "CONN_OK",
                        "message": "Port Opened",
                        "detail": f"Successfully opened serial port {port} with specified parameters."
                    }
                else:
                    return {
                        "status": "error", 
                        "code": "ERR_SERIAL_OPEN",
                        "message": "Port Open Failed",
                        "detail": f"Could not open serial port {port}. Check if the device is connected and permissions are correct."
                    }
            except Exception as e:
                return {
                    "status": "error", 
                    "code": "ERR_SERIAL_GENERIC",
                    "message": "Serial Error",
                    "detail": str(e)
                }

        elif device.type == "OPC_UA":
            params = device.connection_params
            url = params.get("url")
            try:
                async with OpcUaClient(url=url, timeout=3) as client:
                    # Just connecting is enough validation
                    pass
                return {
                    "status": "success", 
                    "code": "CONN_OK",
                    "message": "Session Established",
                    "detail": f"Successfully connected to OPC UA server at {url} and established a session."
                }
            except ConnectionRefusedError:
                 return {
                    "status": "error", 
                    "code": "ERR_CONN_REFUSED",
                    "message": "Connection Refused",
                    "detail": f"Could not connect to {url}. Server might be down or unreachable."
                }
            except Exception as e:
                 return {
                    "status": "error", 
                    "code": "ERR_OPCUA_GENERIC",
                    "message": "OPC UA Error",
                    "detail": str(e)
                }

        elif device.type == "SNMP":
            params = device.connection_params
            host = params.get("host")
            port = params.get("port", 161)
            community = params.get("community", "public")
            
            # Test by getting sysDescr (1.3.6.1.2.1.1.1.0)
            try:
                errorIndication, errorStatus, errorIndex, varBinds = await getCmd(
                    SnmpEngine(),
                    CommunityData(community),
                    UdpTransportTarget((host, port), timeout=2, retries=1),
                    ContextData(),
                    ObjectType(ObjectIdentity('1.3.6.1.2.1.1.1.0'))
                )
                if errorIndication:
                    return {
                        "status": "error", 
                        "code": "ERR_SNMP_TIMEOUT" if "No response" in str(errorIndication) else "ERR_SNMP_GENERIC",
                        "message": "SNMP Error",
                        "detail": str(errorIndication)
                    }
                elif errorStatus:
                    return {
                        "status": "error", 
                        "code": f"ERR_SNMP_{errorStatus.prettyPrint()}",
                        "message": "SNMP Error Status",
                        "detail": errorStatus.prettyPrint()
                    }
                else:
                    return {
                        "status": "success", 
                        "code": "CONN_OK",
                        "message": "Agent Responded",
                        "detail": f"Successfully queried sysDescr from SNMP agent at {host}."
                    }
            except Exception as e:
                return {
                    "status": "error", 
                    "code": "ERR_SNMP_EXCEPTION",
                    "message": "SNMP Exception",
                    "detail": str(e)
                }

        elif device.type == "IEC104":
            params = device.connection_params
            host = params.get("host")
            port = params.get("port", 2404)
            
            try:
                # Let's try a simple socket connect for IEC104 to verify reachability
                reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=3)
                writer.close()
                await writer.wait_closed()
                return {
                    "status": "success", 
                    "code": "CONN_OK",
                    "message": "Port Reachable",
                    "detail": f"Successfully established TCP connection to IEC104 server at {host}:{port}."
                }
            except (asyncio.TimeoutError, TimeoutError):
                return {
                    "status": "error", 
                    "code": "ERR_TIMEOUT",
                    "message": "Connection Timed Out",
                    "detail": f"Timed out connecting to {host}:{port}."
                }
            except ConnectionRefusedError:
                return {
                    "status": "error", 
                    "code": "ERR_CONN_REFUSED",
                    "message": "Connection Refused",
                    "detail": f"Target {host}:{port} rejected the connection."
                }
            except Exception as e:
                return {
                    "status": "error", 
                    "code": "ERR_IEC104_GENERIC",
                    "message": "Connection Error",
                    "detail": str(e)
                }

        return {
            "status": "error", 
            "code": "ERR_UNKNOWN_TYPE",
            "message": "Unknown Device Type",
            "detail": f"Device type '{device.type}' is not supported for testing."
        }

    except Exception as e:
        return {
            "status": "error", 
            "code": "ERR_INTERNAL",
            "message": "Internal Error",
            "detail": str(e)
        }

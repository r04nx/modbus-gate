from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, JSON, Float
from sqlalchemy.orm import relationship
from app.core.database import Base

class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, nullable=True)
    type = Column(String) # MODBUS_TCP, MODBUS_RTU, IEC104, OPC_UA, SNMP
    connection_params = Column(JSON) # IP, Port, Baudrate, etc.
    enabled = Column(Boolean, default=True)
    polling_interval = Column(Integer, default=1000) # ms

    tags = relationship("Tag", back_populates="device", cascade="all, delete-orphan")

class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    tag_id = Column(String, unique=True, index=True) # Unique identifier for Global Store
    name = Column(String)
    description = Column(String, nullable=True)
    type = Column(String) # SYSTEM, IO, USER, CALCULATION
    
    # IO Tag specific
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=True)
    device = relationship("Device", back_populates="tags")
    address = Column(String, nullable=True) # Register address
    data_type = Column(String, nullable=True) # INT16, FLOAT32, etc.
    params = Column(JSON, nullable=True) # Protocol specific params (e.g. register_type, oid, etc.)
    
    # User/Calculation Tag specific
    initial_value = Column(String, nullable=True)
    calculation_formula = Column(String, nullable=True) # For Calculation tags
    variable_mappings = Column(JSON, nullable=True) # Variable to tag_id mappings for calculations

    enabled = Column(Boolean, default=True)

class ServerConfig(Base):
    __tablename__ = "server_configs"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, unique=True, index=True) # MODBUS_SERVER, OPC_UA_SERVER, IEC104_SERVER, MQTT_PUBLISHER
    enabled = Column(Boolean, default=False)
    config = Column(JSON, default={}) # Port, Host, Topic, etc.


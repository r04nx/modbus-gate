import asyncio
import logging
from app.models import models
from pymodbus.client import AsyncModbusTcpClient, AsyncModbusSerialClient
from pysnmp.hlapi.asyncio import SnmpEngine, CommunityData, UdpTransportTarget, ContextData, ObjectType, ObjectIdentity, setCmd
from pysnmp.proto.rfc1902 import Integer, Gauge32, Counter32, Counter64, OctetString


class TagWriterService:
    """Service for writing values to tags via different protocols"""
    
    async def write_tag(self, device: models.Device, tag: models.Tag, value) -> tuple[bool, str]:
        """
        Write a value to a tag based on device protocol
        
        Args:
            device: Device model instance
            tag: Tag model instance  
            value: Value to write
            
        Returns:
            Tuple of (success: bool, message: str)
        """
        try:
            if device.type == "MODBUS_TCP":
                return await self._write_modbus_tcp(device, tag, value)
            elif device.type == "MODBUS_RTU":
                return await self._write_modbus_rtu(device, tag, value)
            elif device.type == "SNMP":
                return await self._write_snmp(device, tag, value)
            elif device.type == "OPC_UA":
                # OPC UA write would go here
                return False, "OPC UA write not yet implemented"
            elif device.type == "IEC104":
                # IEC104 write would go here
                return False, "IEC104 write not yet implemented"
            else:
                return False, f"Write not supported for protocol: {device.type}"
        except Exception as e:
            logging.error(f"Error writing to tag {tag.tag_id}: {e}")
            return False, f"Write error: {str(e)}"
    
    async def _write_modbus_tcp(self, device: models.Device, tag: models.Tag, value) -> tuple[bool, str]:
        """Write to Modbus TCP device"""
        params = device.connection_params
        host = params.get("host")
        port = params.get("port", 502)
        slave_id = params.get("slave_id", 1)
        
        try:
            client = AsyncModbusTcpClient(host, port=port, timeout=3)
            await client.connect()
            
            if not client.connected:
                return False, f"Failed to connect to Modbus TCP device at {host}:{port}"
            
            addr = int(tag.address)
            register_type = (tag.params or {}).get("register_type", "HOLDING")
            
            # Convert value to appropriate type
            try:
                int_value = int(value)
            except (ValueError, TypeError):
                client.close()
                return False, f"Invalid value for Modbus write: {value}"
            
            # Write based on register type
            result = None
            if register_type == "HOLDING":
                result = await client.write_register(addr, int_value, slave=slave_id)
            elif register_type == "COIL":
                bool_value = bool(int_value)
                result = await client.write_coil(addr, bool_value, slave=slave_id)
            else:
                client.close()
                return False, f"Cannot write to {register_type} registers (read-only)"
            
            client.close()
            
            if result and not result.isError():
                return True, f"Successfully wrote {value} to {register_type} register {addr}"
            else:
                return False, f"Modbus write error: {result}"
                
        except Exception as e:
            return False, f"Modbus TCP write exception: {str(e)}"
    
    async def _write_modbus_rtu(self, device: models.Device, tag: models.Tag, value) -> tuple[bool, str]:
        """Write to Modbus RTU device"""
        params = device.connection_params
        
        try:
            client = AsyncModbusSerialClient(
                params.get("port"),
                baudrate=params.get("baudrate", 9600),
                bytesize=params.get("bytesize", 8),
                parity=params.get("parity", "N"),
                stopbits=params.get("stopbits", 1),
                timeout=3
            )
            await client.connect()
            
            if not client.connected:
                return False, f"Failed to connect to Modbus RTU device on {params.get('port')}"
            
            slave_id = params.get("slave_id", 1)
            addr = int(tag.address)
            register_type = (tag.params or {}).get("register_type", "HOLDING")
            
            # Convert value
            try:
                int_value = int(value)
            except (ValueError, TypeError):
                client.close()
                return False, f"Invalid value for Modbus write: {value}"
            
            # Write based on register type
            result = None
            if register_type == "HOLDING":
                result = await client.write_register(addr, int_value, slave=slave_id)
            elif register_type == "COIL":
                bool_value = bool(int_value)
                result = await client.write_coil(addr, bool_value, slave=slave_id)
            else:
                client.close()
                return False, f"Cannot write to {register_type} registers (read-only)"
            
            client.close()
            
            if result and not result.isError():
                return True, f"Successfully wrote {value} to {register_type} register {addr}"
            else:
                return False, f"Modbus write error: {result}"
                
        except Exception as e:
            return False, f"Modbus RTU write exception: {str(e)}"
    
    async def _write_snmp(self, device: models.Device, tag: models.Tag, value) -> tuple[bool, str]:
        """Write to SNMP device using SET command"""
        params = device.connection_params
        host = params.get("host")
        port = params.get("port", 161)
        community = params.get("community", "private")  # Write usually needs 'private' community
        
        try:
            # Determine SNMP data type
            # For simplicity, we'll try Integer first, then OctetString
            snmp_value = None
            try:
                snmp_value = Integer(int(value))
            except (ValueError, TypeError):
                snmp_value = OctetString(str(value))
            
            errorIndication, errorStatus, errorIndex, varBinds = await setCmd(
                SnmpEngine(),
                CommunityData(community),
                UdpTransportTarget((host, port)),
                ContextData(),
                ObjectType(ObjectIdentity(tag.address), snmp_value)
            )
            
            if errorIndication:
                return False, f"SNMP Network Error: {errorIndication}"
            elif errorStatus:
                return False, f"SNMP Protocol Error: {errorStatus.prettyPrint()} at {errorIndex and varBinds[int(errorIndex) - 1][0] or '?'}"
            else:
                return True, f"Successfully wrote {value} to OID {tag.address}"
                
        except Exception as e:
            return False, f"SNMP write exception: {str(e)}"

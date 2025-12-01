import asyncio
import logging
from typing import Tuple
from app.models import models
from pymodbus.client import AsyncModbusTcpClient, AsyncModbusSerialClient
from pysnmp.hlapi.asyncio import SnmpEngine, CommunityData, UdpTransportTarget, ContextData, ObjectType, ObjectIdentity, setCmd
from pysnmp.proto.rfc1902 import Integer, Gauge32, Counter32, Counter64, OctetString


class TagWriterService:
    """Service for writing values to tags via different protocols"""
    
    async def write_tag(self, device: models.Device, tag: models.Tag, value) -> Tuple[bool, str]:
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
                return await self._write_opc_ua(device, tag, value)
            elif device.type == "IEC104":
                # IEC104 write would go here
                return False, "IEC104 write not yet implemented"
            else:
                return False, f"Write not supported for protocol: {device.type}"
        except Exception as e:
            logging.error(f"Error writing to tag {tag.tag_id}: {e}")
            return False, f"Write error: {str(e)}"
    
    async def _write_modbus_tcp(self, device: models.Device, tag: models.Tag, value) -> Tuple[bool, str]:
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
    
    async def _write_modbus_rtu(self, device: models.Device, tag: models.Tag, value) -> Tuple[bool, str]:
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
    
    async def _write_snmp(self, device: models.Device, tag: models.Tag, value) -> Tuple[bool, str]:
        """Write to SNMP device using SET command"""
        params = device.connection_params
        host = params.get("host")
        port = params.get("port", 161)
        community = params.get("community", "private")  # Write usually needs 'private' community
        
        try:
            # Determine SNMP data type based on tag configuration or value
            snmp_value = None
            data_type = tag.data_type
            
            try:
                if data_type in ["INTEGER", "INT16", "INT32"]:
                    snmp_value = Integer(int(value))
                elif data_type in ["GAUGE", "GAUGE32", "UINT32"]:
                    snmp_value = Gauge32(int(value))
                elif data_type in ["COUNTER", "COUNTER32"]:
                    snmp_value = Counter32(int(value))
                elif data_type in ["COUNTER64"]:
                    snmp_value = Counter64(int(value))
                elif data_type in ["STRING", "OCTET_STRING"]:
                    snmp_value = OctetString(str(value))
                else:
                    # Fallback auto-detection
                    try:
                        snmp_value = Integer(int(value))
                    except (ValueError, TypeError):
                        snmp_value = OctetString(str(value))
            except Exception as e:
                return False, f"Failed to convert value '{value}' to SNMP type {data_type}: {e}"
            
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

    async def _write_opc_ua(self, device: models.Device, tag: models.Tag, value) -> Tuple[bool, str]:
        """Write to OPC UA device"""
        from asyncua import Client, ua
        
        params = device.connection_params
        url = params.get("url")
        if not url:
            # Construct URL if not provided directly
            host = params.get("host", "localhost")
            port = params.get("port", 4840)
            url = f"opc.tcp://{host}:{port}"
            
        try:
            async with Client(url=url) as client:
                # Find the node
                try:
                    node = client.get_node(tag.address)
                    # Read data type to ensure we write the correct variant
                    # This is optional but good for safety. For now, we'll try to infer or use tag type.
                    
                    # Convert value based on tag data type
                    variant_type = None
                    converted_value = value
                    
                    if tag.data_type in ["INT16", "INT32"]:
                        converted_value = int(value)
                        variant_type = ua.VariantType.Int32
                    elif tag.data_type in ["UINT16", "UINT32"]:
                        converted_value = int(value)
                        variant_type = ua.VariantType.UInt32
                    elif tag.data_type in ["INT64"]:
                        converted_value = int(value)
                        variant_type = ua.VariantType.Int64
                    elif tag.data_type in ["UINT64"]:
                        converted_value = int(value)
                        variant_type = ua.VariantType.UInt64
                    elif tag.data_type in ["FLOAT", "FLOAT32"]:
                        converted_value = float(value)
                        variant_type = ua.VariantType.Float
                    elif tag.data_type in ["DOUBLE", "FLOAT64"]:
                        converted_value = float(value)
                        variant_type = ua.VariantType.Double
                    elif tag.data_type in ["BOOL", "BOOLEAN"]:
                        if isinstance(value, str):
                            converted_value = value.lower() in ('true', '1', 'yes', 'on')
                        else:
                            converted_value = bool(value)
                        variant_type = ua.VariantType.Boolean
                    elif tag.data_type == "STRING":
                        converted_value = str(value)
                        variant_type = ua.VariantType.String
                    
                    # Create DataValue with Variant
                    if variant_type:
                        dv = ua.DataValue(ua.Variant(converted_value, variant_type))
                    else:
                        # Let asyncua try to guess
                        dv = ua.DataValue(ua.Variant(converted_value))
                        
                    await node.write_value(dv)
                    return True, f"Successfully wrote {value} to Node {tag.address}"
                    
                except Exception as e:
                    return False, f"OPC UA Node Error: {e}"
                    
        except Exception as e:
            return False, f"OPC UA Connection Error: {e}"

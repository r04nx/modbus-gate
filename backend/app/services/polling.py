import asyncio
import logging
import struct
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models import models
from app.core.store import GlobalDataStore
from pymodbus.client import AsyncModbusTcpClient, AsyncModbusSerialClient
from asyncua import Client as OpcUaClient
from pysnmp.hlapi.asyncio import (
    SnmpEngine, CommunityData, UsmUserData, UdpTransportTarget, ContextData, 
    ObjectType, ObjectIdentity, getCmd,
    usmHMACMD5AuthProtocol, usmHMACSHAAuthProtocol,
    usmDESPrivProtocol, usmAesCfb128Protocol
)
import c104

# Suppress verbose asyncua logging
logging.getLogger('asyncua').setLevel(logging.WARNING)

def convert_byte_order(registers, byte_order='ABCD', data_type='FLOAT32'):
    """
    Convert multi-register Modbus data based on byte order.
    
    Args:
        registers: List of register values (16-bit each)
        byte_order: 'ABCD', 'DCBA', 'BADC', or 'CDAB'
        data_type: Data type to interpret as (FLOAT32, INT32, UINT32, FLOAT64, INT64, UINT64)
    
    Returns:
        Converted value
    """
    if not registers or len(registers) == 0:
        return None
    
    # For 32-bit types (2 registers)
    if data_type in ['FLOAT32', 'INT32', 'UINT32']:
        if len(registers) < 2:
            return None
        
        # Get the two 16-bit registers
        reg1, reg2 = registers[0], registers[1]
        
        # Convert to bytes based on byte order
        if byte_order == 'ABCD':  # Big Endian (default)
            bytes_data = struct.pack('>HH', reg1, reg2)
        elif byte_order == 'DCBA':  # Little Endian
            bytes_data = struct.pack('<HH', reg2, reg1)
        elif byte_order == 'BADC':  # Mid-Big Endian
            bytes_data = struct.pack('>HH', reg2, reg1)
        elif byte_order == 'CDAB':  # Mid-Little Endian
            bytes_data = struct.pack('<HH', reg1, reg2)
        else:
            bytes_data = struct.pack('>HH', reg1, reg2)  # Default to ABCD
        
        # Unpack based on data type
        if data_type == 'FLOAT32':
            return struct.unpack('>f' if byte_order in ['ABCD', 'BADC'] else '<f', bytes_data)[0]
        elif data_type == 'INT32':
            return struct.unpack('>i' if byte_order in ['ABCD', 'BADC'] else '<i', bytes_data)[0]
        elif data_type == 'UINT32':
            return struct.unpack('>I' if byte_order in ['ABCD', 'BADC'] else '<I', bytes_data)[0]
    
    # For 64-bit types (4 registers)
    elif data_type in ['FLOAT64', 'INT64', 'UINT64']:
        if len(registers) < 4:
            return None
        
        reg1, reg2, reg3, reg4 = registers[0], registers[1], registers[2], registers[3]
        
        # Convert to bytes based on byte order
        if byte_order == 'ABCD':  # Big Endian
            bytes_data = struct.pack('>HHHH', reg1, reg2, reg3, reg4)
        elif byte_order == 'DCBA':  # Little Endian
            bytes_data = struct.pack('<HHHH', reg4, reg3, reg2, reg1)
        elif byte_order == 'BADC':  # Mid-Big Endian
            bytes_data = struct.pack('>HHHH', reg2, reg1, reg4, reg3)
        elif byte_order == 'CDAB':  # Mid-Little Endian
            bytes_data = struct.pack('<HHHH', reg3, reg4, reg1, reg2)
        else:
            bytes_data = struct.pack('>HHHH', reg1, reg2, reg3, reg4)
        
        # Unpack based on data type
        if data_type == 'FLOAT64':
            return struct.unpack('>d' if byte_order in ['ABCD', 'BADC'] else '<d', bytes_data)[0]
        elif data_type == 'INT64':
            return struct.unpack('>q' if byte_order in ['ABCD', 'BADC'] else '<q', bytes_data)[0]
        elif data_type == 'UINT64':
            return struct.unpack('>Q' if byte_order in ['ABCD', 'BADC'] else '<Q', bytes_data)[0]
    
    return None


class PollingEngine:
    def __init__(self):
        self.running = False
        self.store = GlobalDataStore()

    async def start(self):
        self.running = True
        asyncio.create_task(self._loop())

    async def stop(self):
        self.running = False

    async def _loop(self):
        while self.running:
            try:
                db: Session = SessionLocal()
                devices = db.query(models.Device).filter(models.Device.enabled == True).all()
                
                tasks = []
                for device in devices:
                    tasks.append(self._poll_device(device))
                
                if tasks:
                    await asyncio.gather(*tasks)
                
                db.close()
            except Exception as e:
                logging.error(f"Error in polling loop: {e}")
            
            await asyncio.sleep(1) # Global polling cycle tick

            # Handle disabled devices - Update their tags to DISABLED
            try:
                db: Session = SessionLocal()
                disabled_devices = db.query(models.Device).filter(models.Device.enabled == False).all()
                for device in disabled_devices:
                    for tag in device.tags:
                        # Only update if not already DISABLED to avoid spamming store updates
                        # (Store handles check, but we save DB query overhead if we could check here, 
                        # but we can't easily check store without async call. Store check is fast.)
                        await self.store.update_tag(tag.tag_id, None, quality="DISABLED", error_message="Device Disabled")
                db.close()
            except Exception as e:
                logging.error(f"Error handling disabled devices: {e}")

    async def _handle_error(self, tag, error_msg):
        """
        Handle polling error by applying fallback logic if configured.
        Only applies to IO tags - SYSTEM and SERVER tags return None on error.
        """
        value = None
        
        # Only apply fallback mechanism to IO tags
        # SYSTEM and SERVER tags should return None on error
        if tag.type != 'IO':
            # For non-IO tags, just update with None and BAD quality
            await self.store.update_tag(tag.tag_id, None, quality="BAD", error_message=error_msg)
            return
        
        # Check fallback configuration for IO tags
        fallback_type = tag.fallback_type or 'none'
        
        # If fallback is 'none', return None
        if fallback_type == 'none':
            await self.store.update_tag(tag.tag_id, None, quality="BAD", error_message=error_msg)
            return
        
        if fallback_type == 'default' and tag.fallback_value:
            # Use configured default value
            try:
                # Try to parse as number first
                val_float = float(tag.fallback_value)
                if val_float.is_integer():
                    value = int(val_float)
                else:
                    value = val_float
            except (ValueError, AttributeError):
                # Use as string
                value = tag.fallback_value
                
        elif fallback_type == 'last_success':
            # Get last known good value from store
            current_tag = await self.store.get_tag(tag.tag_id)
            if current_tag:
                value = current_tag.value
        
        # Update store with fallback value (if any) and BAD quality
        await self.store.update_tag(tag.tag_id, value, quality="BAD", error_message=error_msg)

    async def _poll_device(self, device: models.Device):
        try:
            if device.type == "MODBUS_TCP":
                await self._poll_modbus_tcp(device)
            elif device.type == "MODBUS_RTU":
                await self._poll_modbus_rtu(device)
            elif device.type == "OPC_UA":
                await self._poll_opc_ua(device)
            elif device.type == "SNMP":
                await self._poll_snmp(device)
            elif device.type == "IEC104":
                await self._poll_iec104(device)
        except Exception as e:
            logging.error(f"Error polling device {device.name}: {e}")

    async def _poll_modbus_tcp(self, device: models.Device):
        params = device.connection_params
        client = AsyncModbusTcpClient(params.get("host"), port=params.get("port", 502))
        await self._poll_modbus_common(client, device, params)

    async def _poll_modbus_rtu(self, device: models.Device):
        params = device.connection_params
        client = AsyncModbusSerialClient(
            params.get("port"), 
            baudrate=params.get("baudrate", 9600),
            bytesize=params.get("bytesize", 8),
            parity=params.get("parity", "N"),
            stopbits=params.get("stopbits", 1)
        )
        await self._poll_modbus_common(client, device, params)

    async def _poll_modbus_common(self, client, device, params):
        try:
            await client.connect()
            if client.connected:
                for tag in device.tags:
                    if tag.enabled and tag.address:
                        try:
                            addr = int(tag.address)
                            slave_id = params.get("slave_id", 1)
                            register_type = (tag.params or {}).get("register_type", "HOLDING")
                            data_type = tag.data_type or "INT16"
                            byte_order = (tag.params or {}).get("byte_order", "ABCD")
                            
                            # Determine how many registers to read based on data type
                            register_count = 1
                            if data_type in ['FLOAT32', 'INT32', 'UINT32']:
                                register_count = 2
                            elif data_type in ['FLOAT64', 'INT64', 'UINT64']:
                                register_count = 4
                            
                            rr = None
                            if register_type == "HOLDING":
                                rr = await client.read_holding_registers(addr, count=register_count, device_id=slave_id)
                            elif register_type == "INPUT":
                                rr = await client.read_input_registers(addr, count=register_count, device_id=slave_id)
                            elif register_type == "COIL":
                                rr = await client.read_coils(addr, count=1, device_id=slave_id)
                            elif register_type == "DISCRETE":
                                rr = await client.read_discrete_inputs(addr, count=1, device_id=slave_id)
                                
                            if rr and not rr.isError():
                                # Handle coils and discrete inputs (single bit)
                                if register_type in ["COIL", "DISCRETE"]:
                                    val = rr.bits[0]
                                # Handle single register types
                                elif data_type in ['INT16', 'UINT16', 'BOOLEAN']:
                                    val = rr.registers[0]
                                    # Convert based on data type
                                    if data_type == 'INT16':
                                        # Convert unsigned to signed
                                        val = val if val < 32768 else val - 65536
                                    elif data_type == 'BOOLEAN':
                                        val = bool(val)
                                # Handle multi-register types with byte order conversion
                                elif data_type in ['FLOAT32', 'INT32', 'UINT32', 'FLOAT64', 'INT64', 'UINT64']:
                                    val = convert_byte_order(rr.registers, byte_order, data_type)
                                else:
                                    val = rr.registers[0]
                                
                                await self.store.update_tag(tag.tag_id, val)
                            else:
                                error_msg = f"Modbus Error: {rr}" if rr else "Modbus Error: No response"
                                logging.error(f"Modbus read error for tag {tag.tag_id}: {error_msg}")
                                await self._handle_error(tag, error_msg)
                        except Exception as e:
                            error_msg = f"Modbus Exception: {str(e)}"
                            logging.error(f"Error reading tag {tag.tag_id}: {error_msg}")
                            await self._handle_error(tag, error_msg)
            else:
                # Connection failed
                error_msg = f"Modbus Connection Error: Failed to connect to {params.get('host', 'device')}"
                logging.error(error_msg)
                for tag in device.tags:
                    if tag.enabled:
                        await self._handle_error(tag, error_msg)
            client.close()
        except Exception as e:
            error_msg = f"Modbus Connection Exception: {str(e)}"
            logging.error(f"Error polling device {device.name}: {error_msg}")
            for tag in device.tags:
                if tag.enabled:
                    await self._handle_error(tag, error_msg)

    async def _poll_opc_ua(self, device: models.Device):
        params = device.connection_params
        url = params.get("url") # e.g. "opc.tcp://localhost:4840"
        
        try:
            client = OpcUaClient(url)
            await client.connect()
            
            for tag in device.tags:
                if tag.enabled and tag.address:
                    try:
                        node = client.get_node(tag.address)
                        val = await node.read_value()
                        await self.store.update_tag(tag.tag_id, val)
                    except Exception as e:
                        error_msg = f"OPC UA Error: {str(e)}"
                        logging.error(f"Error reading OPC UA tag {tag.tag_id}: {error_msg}")
                        await self._handle_error(tag, error_msg)
            
            await client.disconnect()
        except Exception as e:
            error_msg = f"OPC UA Connection Error: {str(e)}"
            logging.error(f"Error connecting to OPC UA {url}: {error_msg}")
            for tag in device.tags:
                if tag.enabled:
                    await self._handle_error(tag, error_msg)

    async def _poll_snmp(self, device: models.Device):
        """Poll SNMP device with support for v1, v2c, and v3"""
        params = device.connection_params
        host = params.get("host")
        port = params.get("port", 161)
        version = params.get("version", "v2c")  # v1, v2c, or v3
        
        # Create authentication data based on SNMP version
        auth_data = None
        
        if version in ["v1", "v2c"]:
            # Community-based authentication
            community = params.get("community", "public")
            mp_model = 0 if version == "v1" else 1
            auth_data = CommunityData(community, mpModel=mp_model)
            
        elif version == "v3":
            # User-based security model
            username = params.get("username")
            if not username:
                logging.error(f"SNMPv3 requires username for device {device.name}")
                return
            
            security_level = params.get("security_level", "noAuthNoPriv")
            auth_protocol = None
            auth_key = None
            priv_protocol = None
            priv_key = None
            
            # Authentication
            if security_level in ["authNoPriv", "authPriv"]:
                auth_proto = params.get("auth_protocol", "SHA")
                auth_protocol = usmHMACSHAAuthProtocol if auth_proto == "SHA" else usmHMACMD5AuthProtocol
                auth_key = params.get("auth_password")
                
                if not auth_key:
                    logging.error(f"SNMPv3 {security_level} requires auth_password for device {device.name}")
                    return
            
            # Privacy (encryption)
            if security_level == "authPriv":
                priv_proto = params.get("priv_protocol", "AES")
                priv_protocol = usmAesCfb128Protocol if priv_proto == "AES" else usmDESPrivProtocol
                priv_key = params.get("priv_password")
                
                if not priv_key:
                    logging.error(f"SNMPv3 authPriv requires priv_password for device {device.name}")
                    return
            
            auth_data = UsmUserData(
                username,
                authKey=auth_key,
                privKey=priv_key,
                authProtocol=auth_protocol,
                privProtocol=priv_protocol
            )
        else:
            logging.error(f"Unsupported SNMP version '{version}' for device {device.name}")
            return

        # Poll each tag
        for tag in device.tags:
            if tag.enabled and tag.address:  # address is OID e.g. "1.3.6.1.2.1.1.1.0"
                try:
                    errorIndication, errorStatus, errorIndex, varBinds = await getCmd(
                        SnmpEngine(),
                        auth_data,
                        UdpTransportTarget((host, port), timeout=params.get("timeout", 5), retries=params.get("retries", 3)),
                        ContextData(),
                        ObjectType(ObjectIdentity(tag.address))
                    )

                    if errorIndication:
                        error_msg = f"SNMP Network Error: {errorIndication}"
                        logging.error(error_msg)
                        await self._handle_error(tag, error_msg)
                    elif errorStatus:
                        error_msg = f"SNMP Protocol Error: {errorStatus.prettyPrint()} at {errorIndex and varBinds[int(errorIndex) - 1][0] or '?'}"
                        logging.error(error_msg)
                        await self._handle_error(tag, error_msg)
                    else:
                        for varBind in varBinds:
                            # varBind is (OID, Value)
                            val = varBind[1]
                            val_str = val.prettyPrint()
                            
                            # Check for SNMP exception values
                            if "No Such Instance" in val_str or "No Such Object" in val_str:
                                error_msg = f"SNMP Error: {val_str}"
                                await self._handle_error(tag, error_msg)
                            else:
                                # Convert SNMP types to python types if needed
                                await self.store.update_tag(tag.tag_id, str(val))
                except Exception as e:
                    error_msg = f"SNMP Exception: {str(e)}"
                    logging.error(f"Error reading SNMP tag {tag.tag_id}: {error_msg}")
                    await self._handle_error(tag, error_msg)

    async def _poll_iec104(self, device: models.Device):
        # IEC104 is usually event-driven, but here we implement a simple poll (interrogation)
        
        params = device.connection_params
        host = params.get("host", "127.0.0.1")
        port = params.get("port", 2404)
        # common_address is used in add_station, not add_connection usually, 
        # but for client we might not need to specify it for connection, 
        # it's part of the ASDU address in the packet.
        
        received_data = {}

        def on_receive(point: c104.Point, previous_info: c104.Information, message: c104.IncomingMessage) -> bool:
            # Map IO address to value
            received_data[str(point.io_address)] = point.value
            return True

        def on_new_point(client, station, io_address, point_type):
            # We need to add the point to the station to interact with it
            # and register the callback
            point = station.add_point(io_address, point_type)
            point.on_receive(on_receive)

        try:
            client = c104.Client()
            client.on_new_point(on_new_point)
            
            connection = client.add_connection(ip=host, port=port)
            
            client.start()
            
            # Send interrogation
            connection.send_interrogation_command()
            
            # Wait a bit for responses
            await asyncio.sleep(1.0)
            
            # Update store
            for tag in device.tags:
                if tag.enabled and tag.address:
                    if tag.address in received_data:
                        await self.store.update_tag(tag.tag_id, received_data[tag.address])
            
            # Client cleanup is handled by garbage collection/destructor in python bindings usually
            
        except Exception as e:
            logging.error(f"Error polling IEC104 device {device.name}: {e}")

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

# Suppress verbose asyncua and pymodbus logging
logging.getLogger('asyncua').setLevel(logging.WARNING)
logging.getLogger('opcua').setLevel(logging.WARNING)
logging.getLogger('uaclient').setLevel(logging.WARNING)
logging.getLogger('pymodbus').setLevel(logging.WARNING)
logging.getLogger('pymodbus.logging').setLevel(logging.WARNING)

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
        self._opcua_clients = {} # Cache for persistent OPC UA connections
        self._serial_locks = {} # Locks for serial ports to prevent racing

    async def start(self):
        self.running = True
        asyncio.create_task(self._loop())

    async def stop(self):
        self.running = False

    async def _loop(self):
        while self.running:
            start_time = asyncio.get_event_loop().time()
            try:
                # 1. Fetch Configuration EFFICIENTLY
                # Open DB, get what we need, and Close immediately.
                # Do NOT hold the session open while polling networks!
                device_configs = []
                disabled_devices = []
                
                try:
                    db: Session = SessionLocal()
                    
                    # Fetch enabled devices with their tags
                    # We load everything into memory dicts/objects to avoid lazy loading issues after session closes
                    devices = db.query(models.Device).filter(models.Device.enabled == True).all()
                    
                    for device in devices:
                        # Create a lightweight config object
                        dev_cfg = {
                            'id': device.id,
                            'name': device.name,
                            'type': device.type,
                            'connection_params': device.connection_params,
                            'tags': []
                        }
                        
                        for tag in device.tags:
                            if tag.enabled:
                                dev_cfg['tags'].append({
                                    'tag_id': tag.tag_id,
                                    'type': tag.type,
                                    'address': tag.address,
                                    'data_type': tag.data_type,
                                    'params': tag.params,
                                    'fallback_type': tag.fallback_type,
                                    'fallback_value': tag.fallback_value
                                })
                        device_configs.append(dev_cfg)
                        
                    # Fetch disabled devices to update their status
                    disabled_devs = db.query(models.Device).filter(models.Device.enabled == False).all()
                    for device in disabled_devs:
                        tags = [t.tag_id for t in device.tags]
                        disabled_devices.append(tags)
                        
                except Exception as e:
                    logging.error(f"Error fetching config from DB: {e}")
                finally:
                    # CRITICAL: Always close the DB session
                    if db:
                        db.close()

                # 2. Perform Polling (No DB Lock here!)
                tasks = []
                for dev_cfg in device_configs:
                    tasks.append(self._poll_device_optimized(dev_cfg))
                
                if tasks:
                    await asyncio.gather(*tasks)

                # 3. Handle Disabled Devices (Update Store)
                for tags in disabled_devices:
                    for tag_id in tags:
                        await self.store.update_tag(tag_id, None, quality="DISABLED", error_message="Device Disabled")

            except Exception as e:
                logging.error(f"Error in polling loop: {e}")
            
            # Simple rate limiting - aim for 1 second loop if possible, or immediate if lagging
            elapsed = asyncio.get_event_loop().time() - start_time
            sleep_time = max(0.1, 1.0 - elapsed)
            await asyncio.sleep(sleep_time)

    async def _handle_error(self, tag, error_msg):
        """
        Handle polling error by applying fallback logic if configured.
        Only applies to IO tags - SYSTEM and SERVER tags return None on error.
        """
        # Support both ORM object and dictionary
        if isinstance(tag, dict):
            tag_id = tag.get('tag_id')
            tag_type = tag.get('type')
            fallback_type = tag.get('fallback_type', 'none')
            fallback_value = tag.get('fallback_value')
        else:
            tag_id = tag.tag_id
            tag_type = tag.type
            fallback_type = tag.fallback_type or 'none'
            fallback_value = tag.fallback_value

        value = None
        
        # Only apply fallback mechanism to IO tags
        # SYSTEM and SERVER tags should return None on error
        if tag_type != 'IO':
            # For non-IO tags, just update with None and BAD quality
            await self.store.update_tag(tag_id, None, quality="BAD", error_message=error_msg)
            return
        
        # If fallback is 'none', return None
        if fallback_type == 'none':
            await self.store.update_tag(tag_id, None, quality="BAD", error_message=error_msg)
            return
        
        if fallback_type == 'default' and fallback_value:
            # Use configured default value
            try:
                # Try to parse as number first
                val_float = float(fallback_value)
                if val_float.is_integer():
                    value = int(val_float)
                else:
                    value = val_float
            except (ValueError, AttributeError):
                # Use as string
                value = fallback_value
                
        elif fallback_type == 'last_success':
            # Get last known good value from store
            current_tag = await self.store.get_tag(tag_id)
            if current_tag:
                value = current_tag.value
        
        # Update store with fallback value (if any) and BAD quality
        await self.store.update_tag(tag_id, value, quality="BAD", error_message=error_msg)

    async def _poll_device_optimized(self, device_cfg):
        try:
            dev_type = device_cfg['type']
            if dev_type == "MODBUS_TCP":
                await self._poll_modbus_tcp(device_cfg)
            elif dev_type == "MODBUS_RTU":
                await self._poll_modbus_rtu(device_cfg)
            elif dev_type == "OPC_UA":
                await self._poll_opc_ua(device_cfg)
            elif dev_type == "SNMP":
                await self._poll_snmp(device_cfg)
            elif dev_type == "IEC104":
                await self._poll_iec104(device_cfg)
        except Exception as e:
            logging.error(f"Error polling device {device_cfg['name']}: {e}")

    # Legacy support
    async def _poll_device(self, device: models.Device):
        # Adapt legacy ORM object to simplified dict to reuse logic if possible, 
        # or just redirect to new logic with adapted structure
        logging.warning("Using legacy _poll_device path - performance warning")
        pass

    async def _poll_modbus_tcp(self, device):
        # device can be dict or ORM object, handle access
        if isinstance(device, dict):
            params = device['connection_params']
            tags = device['tags']
            dev_name = device['name']
        else:
            params = device.connection_params
            tags = device.tags
            dev_name = device.name

        client = AsyncModbusTcpClient(params.get("host"), port=int(params.get("port", 502)))
        await self._poll_modbus_common(client, tags, params, dev_name)

    async def _poll_modbus_rtu(self, device):
        if isinstance(device, dict):
            params = device['connection_params']
            tags = device['tags']
            dev_name = device['name']
        else:
            params = device.connection_params
            tags = device.tags
            dev_name = device.name

        port = params.get("port")
        if port not in self._serial_locks:
            self._serial_locks[port] = asyncio.Lock()
            
        async with self._serial_locks[port]:
            client = AsyncModbusSerialClient(
                port, 
                baudrate=int(params.get("baudrate", 9600)),
                bytesize=int(params.get("bytesize", 8)),
                parity=params.get("parity", "N"),
                stopbits=int(params.get("stopbits", 1))
            )
            
            # PERFORMANCE DEBUG
            start_ts = asyncio.get_event_loop().time()
            await self._poll_modbus_common(client, tags, params, dev_name)
            duration = asyncio.get_event_loop().time() - start_ts
            logging.debug(f"PERF: Modbus RTU {dev_name} polled {len(tags)} tags in {duration:.4f}s")

    async def _poll_modbus_common(self, client, tags, params, dev_name):
        try:
            try:
                await client.connect()
                if client.connected:
                    # OPTIMIZATION: Group tags by type and contiguous addresses
                    # This dramatically reduces the number of round-trips to the device
                    
                    # 1. Group by register type
                    grouped_tags = {}
                    for tag in tags:
                        if isinstance(tag, dict):
                            # Fix check for address (allow 0)
                            # Tags in this list are already filtered by enabled=True in _loop, so default to True
                            if not tag.get('enabled', True) or tag.get('address') is None or tag.get('address') == '': 
                                continue
                            
                            t_params = tag.get('params') or {}
                            reg_type = t_params.get("register_type", "HOLDING")
                            addr = int(tag['address'])
                            # Calculate size
                            dtype = tag.get('data_type') or "INT16"
                            size = 2 if dtype in ['FLOAT32', 'INT32', 'UINT32'] else \
                                   4 if dtype in ['FLOAT64', 'INT64', 'UINT64'] else 1
                            
                            if reg_type not in grouped_tags: grouped_tags[reg_type] = []
                            grouped_tags[reg_type].append({
                                'tag': tag,
                                'addr': addr,
                                'size': size,
                                'end': addr + size
                            })
                        else:
                            logging.warning(f"Skipping non-dict tag: {tag}")
                        
                    # 2. Process groups
                    for reg_type, tag_list in grouped_tags.items():
                        logging.debug(f"DEBUG: Processing {len(tag_list)} tags for type {reg_type}")
                        # Sort by address
                        tag_list.sort(key=lambda x: x['addr'])
                        
                        # BATCH READ IMPLEMENTATION
                        batches = []
                        current_batch = []
                        batch_start = -1
                        batch_end = -1
                        
                        MAX_GAP = 20
                        MAX_COUNT = 120 # Safe limit for Modbus (max PDU ~253 bytes)

                        for item in tag_list:
                            addr = item['addr']
                            size = item['size']
                            end = addr + size
                            
                            if not current_batch:
                                current_batch = [item]
                                batch_start = addr
                                batch_end = end
                            else:
                                # Check if we can extend
                                # Use max(batch_end, end) to handle overlapping/duplicate ranges
                                new_end = max(batch_end, end)
                                new_count = new_end - batch_start
                                gap = addr - batch_end
                                
                                # Logic: 
                                # 1. If overlaps (addr < batch_end), gap is negative. logic checks new_count limit.
                                # 2. If contiguous (addr == batch_end), gap is 0.
                                # 3. If gap (addr > batch_end), gap check applies.
                                
                                if new_count <= MAX_COUNT and (gap <= MAX_GAP or addr < batch_end):
                                    current_batch.append(item)
                                    batch_end = new_end
                                else:
                                    # Close previous batch
                                    batches.append({
                                        'start': batch_start,
                                        'count': batch_end - batch_start,
                                        'items': current_batch
                                    })
                                    # Start new
                                    current_batch = [item]
                                    batch_start = addr
                                    batch_end = end
                        
                        if current_batch:
                            batches.append({
                                'start': batch_start,
                                'count': batch_end - batch_start,
                                'items': current_batch
                            })
                            
                        # Execute Batches
                        for batch in batches:
                             start = batch['start']
                             count = batch['count']
                             items = batch['items']
                             
                             try:
                                slave_id = int(params.get("slave_id", 1))
                                rr = None
                                
                                # Perform Read
                                if reg_type == "HOLDING":
                                    rr = await client.read_holding_registers(start, count=count, device_id=slave_id)
                                elif reg_type == "INPUT":
                                    rr = await client.read_input_registers(start, count=count, device_id=slave_id)
                                elif reg_type == "COIL":
                                    rr = await client.read_coils(start, count=count, device_id=slave_id)
                                elif reg_type == "DISCRETE":
                                    rr = await client.read_discrete_inputs(start, count=count, device_id=slave_id)

                                if rr and not rr.isError():
                                     # Distribute data
                                     for item in items:
                                         tag = item['tag']
                                         t_addr = item['addr']
                                         t_size = item['size']
                                         
                                         offset = t_addr - start
                                         
                                         val = None
                                         if reg_type in ["COIL", "DISCRETE"]:
                                             # rr.bits is list of bools
                                             if offset < len(rr.bits):
                                                 val = rr.bits[offset]
                                         else:
                                             # Registers
                                             if offset + t_size <= len(rr.registers):
                                                 regs = rr.registers[offset : offset + t_size]
                                                 if t_size == 1:
                                                     val = regs[0]
                                                     t_dtype = tag.get('data_type')
                                                     if t_dtype == 'INT16':
                                                        val = val if val < 32768 else val - 65536
                                                     elif t_dtype == 'BOOLEAN':
                                                         val = bool(val)
                                                 else:
                                                     t_params = tag.get('params') or {}
                                                     byte_order = t_params.get("byte_order", "ABCD")
                                                     t_dtype = tag.get('data_type')
                                                     val = convert_byte_order(regs, byte_order, t_dtype)
                                         
                                         
                                         if val is not None:
                                             await self.store.update_tag(tag['tag_id'], val)
                                else:
                                    # Log error once for batch
                                    pass
                             except Exception as e:
                                 failed_tags = ", ".join([item['tag']['tag_id'] for item in items])
                                 logging.error(f"Modbus Batch Read Failed | Device: '{dev_name}' | StartAddr: {start} | Count: {count} | Error: {str(e)} | Affected Tags: [{failed_tags}]")
                else:
                    # Connection failed
                    error_msg = f"Modbus Connection Error: Failed to connect to {params.get('host', 'device')}"
                    logging.error(error_msg)
                    for tag in tags:
                         await self._handle_error(tag, error_msg)
            finally:
                client.close()
        except Exception as e:
            error_msg = f"Modbus Connection Exception: {str(e)}"
            logging.error(f"Error polling device {dev_name}: {error_msg}")
            for tag in tags:
                await self._handle_error(tag, error_msg)

    async def _poll_opc_ua(self, device):
        if isinstance(device, dict):
            params = device['connection_params']
            tags = device['tags']
            dev_name = device['name']
            device_id = device['id']
        else:
            params = device.connection_params
            tags = device.tags
            dev_name = device.name
            device_id = device.id

        url = params.get("url")
        client = self._opcua_clients.get(device_id)
        
        try:
            # Connect if not connected
            if not client:
                client = OpcUaClient(url)
                await client.connect()
                self._opcua_clients[device_id] = client
                logging.info(f"Connected to OPC UA device {dev_name} at {url}")
            
            for tag in tags:
                if isinstance(tag, dict):
                    t_enabled = True
                    t_address = tag['address']
                    t_id = tag['tag_id']
                else:
                    t_enabled = tag.enabled
                    t_address = tag.address
                    t_id = tag.tag_id

                if t_enabled and t_address:
                    try:
                        node = client.get_node(t_address)
                        val = await node.read_value()
                        await self.store.update_tag(t_id, val)
                    except Exception as e:
                        # If we get a connection related error, we should probably reset the client
                        error_msg = f"OPC UA Error: {str(e)}"
                        logging.error(f"Error reading OPC UA tag {t_id}: {error_msg}")
                        await self._handle_error(tag, error_msg)
                        
                        # Check if it's a connection error to trigger reconnect
                        if "connection" in str(e).lower() or "socket" in str(e).lower() or "timeout" in str(e).lower():
                            logging.warning(f"OPC UA connection lost for {dev_name}, resetting client...")
                            try:
                                await client.disconnect()
                            except:
                                pass
                            self._opcua_clients.pop(device_id, None)
                            break # Stop processing tags for this device this cycle

        except Exception as e:
            error_msg = f"OPC UA Connection Error: {str(e)}"
            logging.error(f"Error connecting/polling OPC UA {url}: {error_msg}")
            
            # Remove from cache so we try fresh connection next time
            self._opcua_clients.pop(device_id, None)
            
            for tag in tags:
                await self._handle_error(tag, error_msg)

    async def _poll_snmp(self, device):
        """Poll SNMP device with support for v1, v2c, and v3"""
        if isinstance(device, dict):
            params = device['connection_params']
            tags = device['tags']
            dev_name = device['name']
        else:
            params = device.connection_params
            tags = device.tags
            dev_name = device.name

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
                logging.error(f"SNMPv3 requires username for device {dev_name}")
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
                    logging.error(f"SNMPv3 {security_level} requires auth_password for device {dev_name}")
                    return
            
            # Privacy (encryption)
            if security_level == "authPriv":
                priv_proto = params.get("priv_protocol", "AES")
                priv_protocol = usmAesCfb128Protocol if priv_proto == "AES" else usmDESPrivProtocol
                priv_key = params.get("priv_password")
                
                if not priv_key:
                    logging.error(f"SNMPv3 authPriv requires priv_password for device {dev_name}")
                    return
            
            auth_data = UsmUserData(
                username,
                authKey=auth_key,
                privKey=priv_key,
                authProtocol=auth_protocol,
                privProtocol=priv_protocol
            )
        else:
            logging.error(f"Unsupported SNMP version '{version}' for device {dev_name}")
            return

        # Poll each tag
        for tag in tags:
            if isinstance(tag, dict):
                t_enabled = True
                t_address = tag['address']
                t_id = tag['tag_id']
            else:
                t_enabled = tag.enabled
                t_address = tag.address
                t_id = tag.tag_id

            if t_enabled and t_address:  # address is OID e.g. "1.3.6.1.2.1.1.1.0"
                try:
                    errorIndication, errorStatus, errorIndex, varBinds = await getCmd(
                        SnmpEngine(),
                        auth_data,
                        UdpTransportTarget((host, port), timeout=params.get("timeout", 5), retries=params.get("retries", 3)),
                        ContextData(),
                        ObjectType(ObjectIdentity(t_address))
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
                                await self.store.update_tag(t_id, str(val))
                except Exception as e:
                    error_msg = f"SNMP Exception: {str(e)}"
                    logging.error(f"Error reading SNMP tag {t_id}: {error_msg}")
                    await self._handle_error(tag, error_msg)

    async def _poll_iec104(self, device):
        # IEC104 is usually event-driven, but here we implement a simple poll (interrogation)
        if isinstance(device, dict):
            params = device['connection_params']
            tags = device['tags']
            dev_name = device['name']
        else:
            params = device.connection_params
            tags = device.tags
            dev_name = device.name
        
        host = params.get("host", "127.0.0.1")
        port = params.get("port", 2404)
        
        received_data = {}

        def on_receive(point: c104.Point, previous_info: c104.Information, message: c104.IncomingMessage) -> bool:
            # Map IO address to value
            received_data[str(point.io_address)] = point.value
            return True

        def on_new_point(client: c104.Client, station: c104.Station, io_address: int, point_type: c104.Type) -> None:
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
            ca = int(params.get("common_address", 0))
            connection.interrogation(common_address=ca)
            
            # Wait a bit for responses
            await asyncio.sleep(1.0)
            
            # Update store
            for tag in tags:
                if isinstance(tag, dict):
                    t_enabled = True
                    t_address = tag['address']
                    t_id = tag['tag_id']
                else:
                    t_enabled = tag.enabled
                    t_address = tag.address
                    t_id = tag.tag_id

                if t_enabled and t_address:
                    if t_address in received_data:
                        await self.store.update_tag(t_id, received_data[t_address])
            
            # Client cleanup is handled by garbage collection/destructor in python bindings usually
            
        except Exception as e:
            logging.error(f"Error polling IEC104 device {dev_name}: {e}")

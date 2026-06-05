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
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self.running = False
        self.store = GlobalDataStore()
        self._opcua_clients = {} # Cache for persistent OPC UA connections
        self._iec104_clients = {} # Cache for persistent IEC 104 connections
        self._serial_locks = {} # Locks for serial ports to prevent racing
        self.loop = None
        
        # Smart Polling State
        self._device_stats = {} # {device_id: {'failures': 0, 'backoff_until': 0, 'last_error': '', 'status': 'OK'}}
        self._modbus_clients = {} # Cache for persistent Modbus connections
        self.MAX_CONSECUTIVE_FAILURES = 3
        self.BACKOFF_DURATION = 60 # seconds

    def get_health_status(self):
        """Returns the current health status of all polled devices"""
        return self._device_stats

    async def start(self):
        self.loop = asyncio.get_event_loop()
        self.running = True
        asyncio.create_task(self._loop())

    async def stop(self):
        self.running = False

    async def _loop(self):
        import time
        last_config_load = 0.0
        device_configs = []
        disabled_devices = []
        
        while self.running:
            start_time = asyncio.get_event_loop().time()
            try:
                # 1. Fetch Configuration EFFICIENTLY
                now_time = time.time()
                if now_time - last_config_load > 5.0 or not device_configs:
                    device_configs = []
                    disabled_devices = []
                    db = None
                    try:
                        db = SessionLocal()
                        
                        # Fetch enabled devices with their tags
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
                            
                        last_config_load = now_time
                    except Exception as e:
                        logging.error(f"Error fetching config from DB: {e}")
                    finally:
                        # CRITICAL: Always close the DB session
                        if db:
                            db.close()

                # 2. Perform Polling (No DB Lock here!)
                tasks = []
                current_time = asyncio.get_event_loop().time()
                
                for dev_cfg in device_configs:
                    dev_id = dev_cfg['id']
                    
                    # Check Backoff
                    stats = self._device_stats.get(dev_id, {'failures': 0, 'backoff_until': 0})
                    if stats['backoff_until'] > current_time:
                         # Still in backoff
                         continue
                         
                    # Create wrapper task to handle stats update
                    tasks.append(self._poll_with_stats(dev_cfg, stats))
                
                if tasks:
                    await asyncio.gather(*tasks)

                # 3. Handle Disabled Devices (Update Store)
                for tags in disabled_devices:
                    for tag_id in tags:
                        await self.store.update_tag(tag_id, None, quality="DISABLED", error_message="Device Disabled")

            except Exception as e:
                logging.error(f"Error in polling loop: {e}")
            
            # Simple rate limiting - aim for 1 second loop if possible, or immediate if lagging
            elapsed_total = asyncio.get_event_loop().time() - start_time
            sleep_time = max(0.1, 1.0 - elapsed_total)
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

    async def _poll_with_stats(self, dev_cfg, stats):
        dev_id = dev_cfg['id']
        dev_name = dev_cfg['name']
        tag_count = len(dev_cfg.get('tags', []))
        
        start_ts = asyncio.get_event_loop().time()
        success, error_msg = await self._poll_device_optimized(dev_cfg)
        duration = asyncio.get_event_loop().time() - start_ts
        
        current_time = asyncio.get_event_loop().time()
        
        # Calculate moving average for response time
        avg_resp = stats.get('avg_response_time', 0)
        if avg_resp == 0:
            avg_resp = duration
        else:
            # 80/20 moving average
            avg_resp = (avg_resp * 0.8) + (duration * 0.2)
            
        if success:
            # Reset on success
            if stats.get('failures', 0) > 0:
                logging.info(f"Device '{dev_name}' recovered from connection errors.")
            
            self._device_stats[dev_id] = {
                'failures': 0,
                'backoff_until': 0,
                'last_poll': current_time,
                'status': 'OK',
                'last_error': None,
                'avg_response_time': round(avg_resp, 4),
                'tag_count': tag_count
            }
        else:
            # Increment failure count
            failures = stats.get('failures', 0) + 1
            backoff_until = stats.get('backoff_until', 0)
            status = 'ERROR'
            
            if failures >= self.MAX_CONSECUTIVE_FAILURES:
                backoff_time = self.BACKOFF_DURATION
                backoff_until = current_time + backoff_time
                status = 'BACKOFF'
                logging.warning(f"Device '{dev_name}' unreachable ({failures} consecutive failures). Entering backoff mode for {backoff_time}s.")
            
            self._device_stats[dev_id] = {
                'failures': failures,
                'backoff_until': backoff_until,
                'last_poll': current_time,
                'status': status,
                'last_error': error_msg,
                'avg_response_time': round(avg_resp, 4),
                'tag_count': tag_count
            }

    async def _poll_device_optimized(self, device_cfg):
        try:
            dev_type = device_cfg['type']
            if dev_type == "MODBUS_TCP":
                return await self._poll_modbus_tcp(device_cfg)
            elif dev_type == "MODBUS_RTU":
                return await self._poll_modbus_rtu(device_cfg)
            elif dev_type == "OPC_UA":
                return await self._poll_opc_ua(device_cfg)
            elif dev_type == "SNMP":
                return await self._poll_snmp(device_cfg)
            elif dev_type == "IEC104":
                return await self._poll_iec104(device_cfg)
            return True, None
        except Exception as e:
            return False, str(e)

    # Legacy support
    async def _poll_device(self, device: models.Device):
        # Adapt legacy ORM object to simplified dict to reuse logic if possible, 
        # or just redirect to new logic with adapted structure
        logging.warning("Using legacy _poll_device path - performance warning")
        pass

    async def _poll_modbus_tcp(self, device):
        params = device['connection_params'] if isinstance(device, dict) else device.connection_params
        tags = device['tags'] if isinstance(device, dict) else device.tags
        dev_name = device['name'] if isinstance(device, dict) else device.name
        dev_id = device['id'] if isinstance(device, dict) else device.id

        host = params.get("host")
        port = int(params.get("port", 502))
        client_key = f"tcp_{host}_{port}"

        if client_key not in self._modbus_clients:
            self._modbus_clients[client_key] = AsyncModbusTcpClient(host, port=port)
        
        client = self._modbus_clients[client_key]
        success = await self._poll_modbus_common(client, tags, params, dev_name, client_key)
        error_msg = None if success else f"Failed to connect or poll Modbus TCP at {host}:{port}"
        return success, error_msg

    async def _poll_modbus_rtu(self, device):
        params = device['connection_params'] if isinstance(device, dict) else device.connection_params
        tags = device['tags'] if isinstance(device, dict) else device.tags
        dev_name = device['name'] if isinstance(device, dict) else device.name
        dev_id = device['id'] if isinstance(device, dict) else device.id

        port = params.get("port")
        client_key = f"serial_{port}"

        if port not in self._serial_locks:
            self._serial_locks[port] = asyncio.Lock()
            
        async with self._serial_locks[port]:
            if client_key not in self._modbus_clients:
                self._modbus_clients[client_key] = AsyncModbusSerialClient(
                    port, 
                    baudrate=int(params.get("baudrate", 9600)),
                    bytesize=int(params.get("bytesize", 8)),
                    parity=params.get("parity", "N"),
                    stopbits=int(params.get("stopbits", 1))
                )
            
            client = self._modbus_clients[client_key]
            
            # PERFORMANCE DEBUG
            start_ts = asyncio.get_event_loop().time()
            success = await self._poll_modbus_common(client, tags, params, dev_name, client_key)
            duration = asyncio.get_event_loop().time() - start_ts
            logging.debug(f"PERF: Modbus RTU {dev_name} polled {len(tags)} tags in {duration:.4f}s")
            
            error_msg = None if success else f"Failed to connect or poll Modbus RTU on {port}"
            return success, error_msg

    async def _poll_modbus_common(self, client, tags, params, dev_name, client_key=None):
        try:
            if not client.connected:
                await client.connect()
            
            if client.connected:
                # 1. Group by register type
                grouped_tags = {}
                for tag in tags:
                    if isinstance(tag, dict):
                        if not tag.get('enabled', True) or tag.get('address') is None or tag.get('address') == '': 
                            continue
                        
                        t_params = tag.get('params') or {}
                        reg_type = t_params.get("register_type", "HOLDING")
                        addr = int(tag['address'])
                        dtype = tag.get('data_type') or "INT16"
                        size = 2 if dtype in ['FLOAT32', 'INT32', 'UINT32'] else \
                               4 if dtype in ['FLOAT64', 'INT64', 'UINT64'] else 1
                        
                        if reg_type not in grouped_tags: grouped_tags[reg_type] = []
                        grouped_tags[reg_type].append({'tag': tag, 'addr': addr, 'size': size, 'end': addr + size})
                    
                # 2. Process groups
                for reg_type, tag_list in grouped_tags.items():
                    tag_list.sort(key=lambda x: x['addr'])
                    batches = []
                    current_batch = []
                    batch_start = -1
                    batch_end = -1
                    MAX_GAP = 10 
                    MAX_COUNT = 100 

                    for item in tag_list:
                        addr, size = item['addr'], item['size']
                        end = addr + size
                        if not current_batch:
                            current_batch, batch_start, batch_end = [item], addr, end
                        else:
                            new_end = max(batch_end, end)
                            if (new_end - batch_start) <= MAX_COUNT and ((addr - batch_end) <= MAX_GAP or addr < batch_end):
                                current_batch.append(item)
                                batch_end = new_end
                            else:
                                batches.append({'start': batch_start, 'count': batch_end - batch_start, 'items': current_batch})
                                current_batch, batch_start, batch_end = [item], addr, end
                    
                    if current_batch:
                        batches.append({'start': batch_start, 'count': batch_end - batch_start, 'items': current_batch})
                        
                    slave_id = int(params.get("slave_id", 1))
                    for batch in batches:
                         start, count, items = batch['start'], batch['count'], batch['items']
                         try:
                            rr = None
                            if reg_type == "HOLDING": rr = await client.read_holding_registers(start, count=count, slave=slave_id)
                            elif reg_type == "INPUT": rr = await client.read_input_registers(start, count=count, slave=slave_id)
                            elif reg_type == "COIL": rr = await client.read_coils(start, count=count, slave=slave_id)
                            elif reg_type == "DISCRETE": rr = await client.read_discrete_inputs(start, count=count, slave=slave_id)

                            if rr and not rr.isError():
                                 for item in items:
                                     tag, t_addr, t_size = item['tag'], item['addr'], item['size']
                                     offset = t_addr - start
                                     val = None
                                     if reg_type in ["COIL", "DISCRETE"]:
                                         if offset < len(rr.bits): val = rr.bits[offset]
                                     else:
                                         if offset + t_size <= len(rr.registers):
                                             regs = rr.registers[offset : offset + t_size]
                                             if t_size == 1:
                                                 val = regs[0]
                                                 t_dtype = tag.get('data_type')
                                                 if t_dtype == 'INT16': val = val if val < 32768 else val - 65536
                                                 elif t_dtype == 'BOOLEAN': val = bool(val)
                                             else:
                                                 val = convert_byte_order(regs, tag.get('params', {}).get("byte_order", "ABCD"), tag.get('data_type'))
                                     if val is not None: await self.store.update_tag(tag['tag_id'], val)
                            else:
                                for item in items: await self._handle_error(item['tag'], f"Modbus Error: {rr}")
                         except Exception as e:
                             for item in items: await self._handle_error(item['tag'], str(e))
                return True
            else:
                error_msg = f"Modbus Connection Error: Could not connect to {params.get('host', 'device')}"
                for tag in tags: await self._handle_error(tag, error_msg)
                if client_key: self._modbus_clients.pop(client_key, None)
                return False
        except Exception as e:
            logging.error(f"Error polling device {dev_name}: {e}")
            for tag in tags: await self._handle_error(tag, str(e))
            return False
            
        return True

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
            
            # Collect tags to poll
            enabled_tags = []
            for tag in tags:
                if isinstance(tag, dict):
                    t_enabled = tag.get('enabled', True)
                    t_address = tag.get('address')
                    t_id = tag.get('tag_id')
                else:
                    t_enabled = tag.enabled
                    t_address = tag.address
                    t_id = tag.tag_id
                
                if t_enabled and t_address:
                    enabled_tags.append((tag, t_address, t_id))
            
            if not enabled_tags:
                return True, None
                
            try:
                # 1. Try batch reading first for maximum efficiency
                nodes = [client.get_node(addr) for _, addr, _ in enabled_tags]
                try:
                    vals = await client.read_values(nodes)
                    for (tag, _, t_id), val in zip(enabled_tags, vals):
                        await self.store.update_tag(t_id, val)
                except Exception as batch_err:
                    logging.warning(f"OPC UA batch read failed ({batch_err}) for {dev_name}, falling back to individual reads...")
                    # 2. Fallback to individual reads if batch fails
                    for tag, addr, t_id in enabled_tags:
                        try:
                            node = client.get_node(addr)
                            val = await node.read_value()
                            await self.store.update_tag(t_id, val)
                        except Exception as tag_err:
                            error_msg = f"OPC UA Error: {str(tag_err)}"
                            await self._handle_error(tag, error_msg)
                            # If connection error, raise to trigger reconnect
                            if any(x in str(tag_err).lower() for x in ["connection", "socket", "timeout"]):
                                raise tag_err
            except Exception as e:
                # If we get a connection related error, we should reset the client
                error_msg = f"OPC UA Connection Error: {str(e)}"
                logging.error(f"Error reading OPC UA tags: {error_msg}")
                
                # Check if it's a connection error to trigger reconnect
                if any(x in str(e).lower() for x in ["connection", "socket", "timeout", "badsession", "securechannel"]):
                    logging.warning(f"OPC UA connection lost for {dev_name}, resetting client...")
                    try:
                        await client.disconnect()
                    except:
                        pass
                    self._opcua_clients.pop(device_id, None)
                    return False, error_msg # Signal failure
                
        except Exception as e:
            error_msg = f"OPC UA Connection Error: {str(e)}"
            logging.error(f"Error connecting/polling OPC UA {url}: {error_msg}")
            
            # Remove from cache so we try fresh connection next time
            self._opcua_clients.pop(device_id, None)
            
            for tag in tags:
                await self._handle_error(tag, error_msg)
            return False, error_msg
            
        return True, None

    async def _poll_snmp(self, device):
        """Poll SNMP device with support for v1, v2c, and v3"""
        try:
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
                    return False, "SNMPv3 requires username"
                
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
                        return False, "SNMPv3 requires auth_password"
                
                # Privacy (encryption)
                if security_level == "authPriv":
                    priv_proto = params.get("priv_protocol", "AES")
                    priv_protocol = usmAesCfb128Protocol if priv_proto == "AES" else usmDESPrivProtocol
                    priv_key = params.get("priv_password")
                    
                    if not priv_key:
                        logging.error(f"SNMPv3 authPriv requires priv_password for device {dev_name}")
                        return False, "SNMPv3 requires priv_password"
                
                auth_data = UsmUserData(
                    username,
                    authKey=auth_key,
                    privKey=priv_key,
                    authProtocol=auth_protocol,
                    privProtocol=priv_protocol
                )
            else:
                error_msg = f"Unsupported SNMP version '{version}' for device {dev_name}"
                logging.error(error_msg)
                return False, error_msg

            # Group enabled tags to query in batches
            enabled_tags = []
            for tag in tags:
                if isinstance(tag, dict):
                    t_enabled = tag.get('enabled', True)
                    t_address = tag.get('address')
                    t_id = tag.get('tag_id')
                else:
                    t_enabled = tag.enabled
                    t_address = tag.address
                    t_id = tag.tag_id
                
                if t_enabled and t_address:
                    enabled_tags.append((tag, t_address, t_id))
            
            if not enabled_tags:
                return True, None

            # Initialize SnmpEngine once if not done
            if not hasattr(self, '_snmp_engine'):
                self._snmp_engine = SnmpEngine()

            # Batch queries in groups of 20
            batch_size = 20
            for i in range(0, len(enabled_tags), batch_size):
                batch = enabled_tags[i:i+batch_size]
                var_binds = [ObjectType(ObjectIdentity(t_address)) for _, t_address, _ in batch]
                
                try:
                    errorIndication, errorStatus, errorIndex, varBinds = await getCmd(
                        self._snmp_engine,
                        auth_data,
                        UdpTransportTarget((host, port), timeout=params.get("timeout", 5), retries=params.get("retries", 3)),
                        ContextData(),
                        *var_binds
                    )
                    
                    if errorIndication:
                        error_msg = f"SNMP Network Error: {errorIndication}"
                        logging.error(error_msg)
                        for tag, _, _ in batch:
                            await self._handle_error(tag, error_msg)
                    elif errorStatus:
                        error_msg = f"SNMP Protocol Error: {errorStatus.prettyPrint()}"
                        logging.error(error_msg)
                        for tag, _, _ in batch:
                            await self._handle_error(tag, error_msg)
                    else:
                        for idx, varBind in enumerate(varBinds):
                            if idx < len(batch):
                                tag, _, t_id = batch[idx]
                                val = varBind[1]
                                val_str = val.prettyPrint()
                                
                                if "No Such Instance" in val_str or "No Such Object" in val_str:
                                    await self._handle_error(tag, f"SNMP Error: {val_str}")
                                else:
                                    await self.store.update_tag(t_id, str(val))
                except Exception as e:
                    error_msg = f"SNMP Exception: {str(e)}"
                    logging.error(f"Error querying SNMP batch: {error_msg}")
                    for tag, _, _ in batch:
                        await self._handle_error(tag, error_msg)
                
            return True, None
        except Exception as e:
            return False, str(e)

    async def _poll_iec104(self, device):
        # IEC104 is event-driven; we maintain a persistent client connection
        import time
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
        
        host = params.get("host", "127.0.0.1")
        port = int(params.get("port", 2404))
        ca = int(params.get("common_address", 0))
        
        client_key = device_id
        
        try:
            conn_data = self._iec104_clients.get(client_key)
            if not conn_data:
                logging.info(f"Initializing persistent IEC 104 connection for {dev_name} at {host}:{port}")
                client = c104.Client()
                
                # Define callback to capture self.loop and self.store
                def on_receive(point: c104.Point, previous_info: c104.Information, message: c104.IncomingMessage) -> c104.ResponseState:
                    ioa_str = str(point.io_address)
                    for tag in tags:
                        t_addr = tag.get('address') if isinstance(tag, dict) else tag.address
                        t_id = tag.get('tag_id') if isinstance(tag, dict) else tag.tag_id
                        if t_addr == ioa_str:
                            loop = self.loop or asyncio.get_event_loop()
                            asyncio.run_coroutine_threadsafe(
                                self.store.update_tag(t_id, point.value),
                                loop
                            )
                            break
                    return c104.ResponseState.SUCCESS

                def on_new_point(client: c104.Client, station: c104.Station, io_address: int, point_type: c104.Type) -> None:
                    point = station.add_point(io_address, point_type)
                    point.on_receive(on_receive)

                client.on_new_point(on_new_point)
                connection = client.add_connection(ip=host, port=port)
                client.start()
                
                # Interrogate once on connection
                connection.interrogation(common_address=ca)
                
                self._iec104_clients[client_key] = {
                    'client': client,
                    'connection': connection,
                    'last_interrogation': time.time()
                }
            else:
                # Perform periodic interrogation to ensure fresh data
                now = time.time()
                if now - conn_data.get('last_interrogation', 0) > 60.0:
                    try:
                        conn_data['connection'].interrogation(common_address=ca)
                        conn_data['last_interrogation'] = now
                    except Exception as e:
                        logging.warning(f"IEC 104 interrogation failed for {dev_name}: {e}")
                        # Remove to trigger reconnect next time
                        self._iec104_clients.pop(client_key, None)
                        return False, f"Interrogation failed: {e}"

            return True, None
            
        except Exception as e:
            error_msg = f"Error in IEC104 persistent client for {dev_name}: {e}"
            logging.error(error_msg)
            self._iec104_clients.pop(client_key, None)
            return False, error_msg

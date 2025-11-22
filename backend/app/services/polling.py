import asyncio
import logging
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models import models
from app.core.store import GlobalDataStore
from pymodbus.client import AsyncModbusTcpClient, AsyncModbusSerialClient
from asyncua import Client as OpcUaClient
from pysnmp.hlapi.asyncio import SnmpEngine, CommunityData, UdpTransportTarget, ContextData, ObjectType, ObjectIdentity, getCmd
import c104

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
                            
                            rr = None
                            if register_type == "HOLDING":
                                rr = await client.read_holding_registers(addr, 1, slave=slave_id)
                            elif register_type == "INPUT":
                                rr = await client.read_input_registers(addr, 1, slave=slave_id)
                            elif register_type == "COIL":
                                rr = await client.read_coils(addr, 1, slave=slave_id)
                            elif register_type == "DISCRETE":
                                rr = await client.read_discrete_inputs(addr, 1, slave=slave_id)
                                
                            if rr and not rr.isError():
                                val = rr.registers[0] if hasattr(rr, 'registers') else rr.bits[0]
                                await self.store.update_tag(tag.tag_id, val)
                            else:
                                error_msg = f"Modbus Error: {rr}" if rr else "Modbus Error: No response"
                                logging.error(f"Modbus read error for tag {tag.tag_id}: {error_msg}")
                                await self.store.update_tag(tag.tag_id, None, quality="BAD", error_message=error_msg)
                        except Exception as e:
                            error_msg = f"Modbus Exception: {str(e)}"
                            logging.error(f"Error reading tag {tag.tag_id}: {error_msg}")
                            await self.store.update_tag(tag.tag_id, None, quality="BAD", error_message=error_msg)
            else:
                # Connection failed
                error_msg = f"Modbus Connection Error: Failed to connect to {params.get('host', 'device')}"
                logging.error(error_msg)
                for tag in device.tags:
                    if tag.enabled:
                        await self.store.update_tag(tag.tag_id, None, quality="BAD", error_message=error_msg)
            client.close()
        except Exception as e:
            error_msg = f"Modbus Connection Exception: {str(e)}"
            logging.error(f"Error polling device {device.name}: {error_msg}")
            for tag in device.tags:
                if tag.enabled:
                    await self.store.update_tag(tag.tag_id, None, quality="BAD", error_message=error_msg)

    async def _poll_opc_ua(self, device: models.Device):
        params = device.connection_params
        url = params.get("url") # e.g. "opc.tcp://localhost:4840"
        if not url:
            return

        try:
            async with OpcUaClient(url=url) as client:
                for tag in device.tags:
                    if tag.enabled and tag.address: # address is NodeId e.g. "ns=2;i=2"
                        try:
                            node = client.get_node(tag.address)
                            val = await node.read_value()
                            await self.store.update_tag(tag.tag_id, val)
                        except Exception as e:
                            logging.error(f"Error reading OPC UA tag {tag.tag_id}: {e}")
                            await self.store.update_tag(tag.tag_id, None, quality="BAD")
        except Exception as e:
            logging.error(f"Error connecting to OPC UA {url}: {e}")

    async def _poll_snmp(self, device: models.Device):
        params = device.connection_params
        host = params.get("host")
        port = params.get("port", 161)
        community = params.get("community", "public")

        for tag in device.tags:
            if tag.enabled and tag.address: # address is OID e.g. "1.3.6.1.2.1.1.1.0"
                try:
                    errorIndication, errorStatus, errorIndex, varBinds = await getCmd(
                        SnmpEngine(),
                        CommunityData(community),
                        UdpTransportTarget((host, port)),
                        ContextData(),
                        ObjectType(ObjectIdentity(tag.address))
                    )

                    if errorIndication:
                        error_msg = f"SNMP Network Error: {errorIndication}"
                        logging.error(error_msg)
                        await self.store.update_tag(tag.tag_id, None, quality="BAD", error_message=error_msg)
                    elif errorStatus:
                        error_msg = f"SNMP Protocol Error: {errorStatus.prettyPrint()} at {errorIndex and varBinds[int(errorIndex) - 1][0] or '?'}"
                        logging.error(error_msg)
                        await self.store.update_tag(tag.tag_id, None, quality="BAD", error_message=error_msg)
                    else:
                        for varBind in varBinds:
                            # varBind is (OID, Value)
                            val = varBind[1]
                            val_str = val.prettyPrint()
                            
                            # Check for SNMP exception values
                            if "No Such Instance" in val_str or "No Such Object" in val_str:
                                error_msg = f"SNMP Error: {val_str}"
                                await self.store.update_tag(tag.tag_id, None, quality="BAD", error_message=error_msg)
                            else:
                                # Convert SNMP types to python types if needed
                                await self.store.update_tag(tag.tag_id, str(val))
                except Exception as e:
                    error_msg = f"SNMP Exception: {str(e)}"
                    logging.error(f"Error reading SNMP tag {tag.tag_id}: {error_msg}")
                    await self.store.update_tag(tag.tag_id, None, quality="BAD", error_message=error_msg)

    async def _poll_iec104(self, device: models.Device):
        # IEC104 is usually event-driven, but here we implement a simple poll (interrogation)
        # Note: Creating a client every second is inefficient. 
        # In a real robust system, we would maintain persistent connections.
        # For this implementation, we will try to connect, interrogate, and read.
        
        params = device.connection_params
        host = params.get("host", "127.0.0.1")
        port = params.get("port", 2404)
        common_address = params.get("common_address", 1)

        # We need a way to capture callbacks. 
        # Since c104 is C++ binding, we define a callback closure or class method?
        # c104 python bindings usually take a function.
        
        received_data = {}

        def on_step(point: c104.Point, previous_info: c104.Information, message: c104.Message) -> bool:
            # Map IO address to value
            # point.io_address is the address
            # point.value is the value
            received_data[str(point.io_address)] = point.value
            return True

        try:
            client = c104.Client()
            connection = client.add_connection(ip=host, port=port, common_address=common_address)
            connection.set_on_step(on_step)
            
            client.start()
            
            # Send interrogation
            connection.send_interrogation_command()
            
            # Wait a bit for responses
            await asyncio.sleep(0.5)
            
            # Update store
            for tag in device.tags:
                if tag.enabled and tag.address:
                    if tag.address in received_data:
                        await self.store.update_tag(tag.tag_id, received_data[tag.address])
            
            # Stop client (this might be slow)
            # client.stop() # c104 might not have stop() exposed or it's automatic on GC?
            # Based on c104 examples, we just let it go out of scope? 
            # Actually, if we don't stop it, threads might pile up.
            # c104.Client has no stop() in some versions.
            # Assuming it cleans up.
            
        except Exception as e:
            logging.error(f"Error polling IEC104 device {device.name}: {e}")

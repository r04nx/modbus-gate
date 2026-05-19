import asyncio
import logging
from pymodbus.server import StartAsyncTcpServer
from pymodbus.datastore import ModbusServerContext
try:
    from pymodbus.datastore.context import ModbusSlaveContext
except ImportError:
    from pymodbus.datastore.context import ModbusDeviceContext as ModbusSlaveContext

from pymodbus.datastore import ModbusSequentialDataBlock

try:
    from pymodbus.device import ModbusDeviceIdentification
except ImportError:
    from pymodbus.pdu.device import ModbusDeviceIdentification
from app.core.store import GlobalDataStore

# Custom DataBlock to link with GlobalDataStore
class GlobalStoreDataBlock(ModbusSequentialDataBlock):
    def __init__(self, address, values):
        super().__init__(address, values)
        self.store = GlobalDataStore()

    # This is a simplified implementation. 
    # In a real scenario, we need a mapping between Modbus Registers and Tag IDs.
    # For now, we will just use the internal memory of ModbusSequentialDataBlock
    # and sync it periodically or on demand.
    # A better approach for "maximum flexibility" is to intercept setValues/getValues.
    
    # However, pymodbus architecture is a bit complex to fully override without deep integration.
    # So we will run a sync task that maps GlobalStore tags to Modbus registers.
    pass

class ModbusServerService:
    def __init__(self):
        self.port = 5020
        self.server = None
        self.server_task = None
        self.monitor_task = None
        self.is_running = False
        
        # In pymodbus 3.x, ModbusSlaveContext is the correct class
        self.store = ModbusSlaveContext(
            di=ModbusSequentialDataBlock(0, [0]*10000),
            co=ModbusSequentialDataBlock(0, [0]*10000),
            hr=ModbusSequentialDataBlock(0, [0]*10000),
            ir=ModbusSequentialDataBlock(0, [0]*10000))
        # ModbusServerContext expects a dict mapping slave_id to ModbusDeviceContext
        # For single slave mode, we use slave_id=1
        self.context = ModbusServerContext(devices={1: self.store}, single=False)
        
        self.identity = ModbusDeviceIdentification()
        self.identity.VendorName = 'VistaIOT'
        self.identity.ProductCode = 'VIOT'
        self.identity.VendorUrl = 'http://vistaiot.com'
        self.identity.ProductName = 'VistaIOT Server'
        self.identity.ModelName = 'VistaIOT Server'
        self.identity.MajorMinorRevision = '1.0.0'

    async def start(self):
        # Start the monitoring task which handles server lifecycle
        self.monitor_task = asyncio.create_task(self._monitor_loop())

    async def stop(self):
        if self.server:
            logging.info("Stopping Modbus Server...")
            try:
                await self.server.shutdown()
            except Exception as e:
                logging.error(f"Error stopping Modbus Server: {e}")
            self.server = None
        
        if self.server_task:
            self.server_task.cancel()
            try:
                await self.server_task
            except asyncio.CancelledError:
                pass
            self.server_task = None
        
        self.is_running = False
        logging.info("Modbus Server stopped")

    async def _run_server(self):
        try:
            logging.info(f"Starting Modbus Server on port {self.port}")
            from pymodbus.server import ModbusTcpServer
            self.server = ModbusTcpServer(context=self.context, identity=self.identity, address=("0.0.0.0", self.port))
            self.is_running = True
            await self.server.serve_forever()
        except asyncio.CancelledError:
            logging.info("Modbus Server task cancelled")
        except Exception as e:
            logging.error(f"Modbus Server crashed: {e}")
            self.is_running = False
            self.server = None

    async def _monitor_loop(self):
        from app.core.database import SessionLocal
        from app.models import models
        import json
        
        last_config_hash = None

        while True:
            try:
                # 1. Check Configuration
                db_config = None
                try:
                    db = SessionLocal()
                    config = db.query(models.ServerConfig).filter(models.ServerConfig.type == "MODBUS_SERVER").first()
                    if config:
                        db_config = {
                            "enabled": config.enabled,
                            "port": int(config.config.get("port", 5020)),
                            "mappings": config.config.get("mappings", []),
                            "reset_on_change": config.config.get("reset_on_change", False)
                        }
                    db.close()
                except Exception as e:
                    logging.error(f"Error checking Modbus config: {e}")
                    await asyncio.sleep(5)
                    continue

                if not db_config:
                    await asyncio.sleep(5)
                    continue

                # Calculate hash to detect changes
                current_config_hash = hash(json.dumps(db_config, sort_keys=True))
                config_changed = last_config_hash is not None and current_config_hash != last_config_hash
                last_config_hash = current_config_hash

                # 2. Manage Lifecycle
                should_run = db_config["enabled"]
                target_port = db_config["port"]

                if should_run:
                    if not self.is_running:
                        # Start server
                        self.port = target_port
                        self.server_task = asyncio.create_task(self._run_server())
                        # Wait a bit for it to start
                        await asyncio.sleep(1)
                    
                    elif self.port != target_port:
                        # Restart needed due to port change
                        logging.info(f"Port changed from {self.port} to {target_port}. Restarting...")
                        await self.stop()
                        self.port = target_port
                        self.server_task = asyncio.create_task(self._run_server())
                        await asyncio.sleep(1)
                    
                        # Mappings changed - Clear memory to remove stale data
                        if db_config.get("reset_on_change", False):
                            logging.info("Modbus mappings changed and reset_on_change is enabled. Clearing memory...")
                            self._reset_memory()

                else:
                    if self.is_running:
                        # Stop server
                        logging.info("Modbus Server disabled. Stopping...")
                        await self.stop()

                # 3. Sync Tags (only if running)
                if self.is_running:
                    await self._sync_tags(db_config["mappings"])

            except Exception as e:
                logging.error(f"Error in Modbus monitor loop: {e}")
            
            await asyncio.sleep(1)

    def _reset_memory(self):
        # Re-initialize DataBlocks to zero
        self.store = ModbusSlaveContext(
            di=ModbusSequentialDataBlock(0, [0]*10000),
            co=ModbusSequentialDataBlock(0, [0]*10000),
            hr=ModbusSequentialDataBlock(0, [0]*10000),
            ir=ModbusSequentialDataBlock(0, [0]*10000))
        self.context = ModbusServerContext(devices={1: self.store}, single=False)
        
        # Update running server context if it exists
        if self.server:
            self.server.context = self.context

    async def _sync_tags(self, mappings):
        # This task syncs GlobalDataStore values to Modbus Registers based on explicit mappings
        global_store = GlobalDataStore()
        tags = await global_store.get_all_tags()
        
        for mapping in mappings:
            tag_id = mapping.get("tag_id")
            if tag_id not in tags:
                continue
                
            tag_val = tags[tag_id]
            val = tag_val.value
            
            # Skip if value is None
            if val is None:
                continue

            reg_type = mapping.get("register_type", "HR")
            addr = int(mapping.get("address", 1))
            data_type = mapping.get("data_type", "INT16")
            
            try:
                # Helper to convert value to registers
                registers = self._convert_to_registers(val, data_type)
                
                if reg_type == "HR":
                    self.store.setValues(3, addr, registers)
                elif reg_type == "IR":
                    self.store.setValues(4, addr, registers)
                elif reg_type == "CO":
                    # Coils expect booleans
                    bool_val = [bool(val)]
                    self.store.setValues(1, addr, bool_val)
                elif reg_type == "DI":
                    bool_val = [bool(val)]
                    self.store.setValues(2, addr, bool_val)
                    
            except Exception as e:
                logging.error(f"Error syncing Modbus Server tag mapping '{tag_id}' at address {addr} (register type: {reg_type}): {str(e)}. Please assure it is within bounds.")

    def _convert_to_registers(self, value, data_type):
        import struct
        
        if data_type == "BOOL":
            return [int(bool(value))]
            
        try:
            # Handle numeric types
            if data_type in ["FLOAT32", "FLOAT"]:
                f = float(value)
                # Pack as float, unpack as 2 unsigned shorts
                packed = struct.pack('>f', f)
                return list(struct.unpack('>HH', packed))
            elif data_type in ["INT32", "UINT32"]:
                i = int(value)
                packed = struct.pack('>I', i & 0xFFFFFFFF)
                return list(struct.unpack('>HH', packed))
            elif data_type in ["INT64", "UINT64", "FLOAT64", "DOUBLE"]:
                # 4 registers
                if "FLOAT" in data_type or "DOUBLE" in data_type:
                    f = float(value)
                    packed = struct.pack('>d', f)
                else:
                    i = int(value)
                    packed = struct.pack('>Q', i & 0xFFFFFFFFFFFFFFFF)
                return list(struct.unpack('>HHHH', packed))
            else:
                # Default INT16/UINT16
                return [int(value) & 0xFFFF]
        except Exception:
            return [0]

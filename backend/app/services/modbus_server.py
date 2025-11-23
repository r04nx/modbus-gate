import asyncio
import logging
from pymodbus.server.async_io import StartAsyncTcpServer
from pymodbus.datastore import ModbusSlaveContext, ModbusServerContext
from pymodbus.datastore import ModbusSequentialDataBlock
from pymodbus.device import ModbusDeviceIdentification
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
        self.server_task = None
        self.store = ModbusSlaveContext(
            di=ModbusSequentialDataBlock(0, [0]*10000),
            co=ModbusSequentialDataBlock(0, [0]*10000),
            hr=ModbusSequentialDataBlock(0, [0]*10000),
            ir=ModbusSequentialDataBlock(0, [0]*10000))
        # ModbusServerContext expects a dict mapping slave_id to ModbusSlaveContext
        # For single slave mode, we use slave_id=1
        self.context = ModbusServerContext(slaves={1: self.store}, single=False)
        
        self.identity = ModbusDeviceIdentification()
        self.identity.VendorName = 'VistaIOT'
        self.identity.ProductCode = 'VIOT'
        self.identity.VendorUrl = 'http://vistaiot.com'
        self.identity.ProductName = 'VistaIOT Server'
        self.identity.ModelName = 'VistaIOT Server'
        self.identity.MajorMinorRevision = '1.0.0'

    async def start(self):
        # Load config from DB
        await self._load_config()
        
        # Start the server in a background task
        self.server_task = asyncio.create_task(self._run_server())
        # Start sync task
        asyncio.create_task(self._sync_store())

    async def _load_config(self):
        from app.core.database import SessionLocal
        from app.models import models
        
        try:
            db = SessionLocal()
            config = db.query(models.ServerConfig).filter(models.ServerConfig.type == "MODBUS_SERVER").first()
            if config and config.enabled:
                self.port = int(config.config.get("port", 5020))
            db.close()
        except Exception as e:
            logging.error(f"Error loading Modbus Server config: {e}")

    async def _run_server(self):
        logging.info(f"Starting Modbus Server on port {self.port}")
        await StartAsyncTcpServer(context=self.context, identity=self.identity, address=("0.0.0.0", self.port))

    async def _sync_store(self):
        # This task syncs GlobalDataStore values to Modbus Registers based on explicit mappings
        from app.core.database import SessionLocal
        from app.models import models
        
        global_store = GlobalDataStore()
        
        while True:
            try:
                # Reload config periodically to catch updates
                # In a production system, we might want a more event-driven approach
                mappings = []
                try:
                    db = SessionLocal()
                    config = db.query(models.ServerConfig).filter(models.ServerConfig.type == "MODBUS_SERVER").first()
                    if config and config.enabled:
                        mappings = config.config.get("mappings", [])
                    db.close()
                except Exception as e:
                    logging.error(f"Error reloading Modbus config: {e}")

                if not mappings:
                    await asyncio.sleep(2)
                    continue

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
                    unit_id = int(mapping.get("unit_id", 1)) # Currently we only support single context, so unit_id is ignored or used for routing if we had multiple slaves
                    
                    try:
                        # Convert value based on data type
                        # This is a simplified conversion. 
                        # For FLOAT32/INT32/INT64 we need to split into registers.
                        
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
                        # logging.error(f"Error syncing tag {tag_id}: {e}")
                        pass
                        
            except Exception as e:
                logging.error(f"Error syncing Modbus store: {e}")
            await asyncio.sleep(0.5)

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

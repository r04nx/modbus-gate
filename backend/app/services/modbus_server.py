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
    def __init__(self, port: int = 5020): # Default to 5020 to avoid permission issues
        self.port = port
        self.server_task = None
        self.store = ModbusSlaveContext(
            di=ModbusSequentialDataBlock(0, [0]*10000),
            co=ModbusSequentialDataBlock(0, [0]*10000),
            hr=ModbusSequentialDataBlock(0, [0]*10000),
            ir=ModbusSequentialDataBlock(0, [0]*10000))
        self.context = ModbusServerContext(slaves=self.store, single=True)
        
        self.identity = ModbusDeviceIdentification()
        self.identity.VendorName = 'VistaIOT'
        self.identity.ProductCode = 'VIOT'
        self.identity.VendorUrl = 'http://vistaiot.com'
        self.identity.ProductName = 'VistaIOT Server'
        self.identity.ModelName = 'VistaIOT Server'
        self.identity.MajorMinorRevision = '1.0.0'

    async def start(self):
        # Start the server in a background task
        self.server_task = asyncio.create_task(self._run_server())
        # Start sync task
        asyncio.create_task(self._sync_store())

    async def _run_server(self):
        logging.info(f"Starting Modbus Server on port {self.port}")
        await StartAsyncTcpServer(context=self.context, identity=self.identity, address=("0.0.0.0", self.port))

    async def _sync_store(self):
        # This task syncs GlobalDataStore values to Modbus Registers
        # We need a mapping mechanism. For now, let's assume a simple mapping:
        # Tag "MODBUS_HR_1" -> Holding Register 1
        global_store = GlobalDataStore()
        while True:
            try:
                tags = await global_store.get_all_tags()
                for tag_id, tag_val in tags.items():
                    # Check if tag is mapped to a register
                    # Format: REG_TYPE_ADDRESS e.g. HR_100, IR_20, CO_5
                    parts = tag_id.split('_')
                    if len(parts) >= 2:
                        reg_type = parts[0]
                        try:
                            addr = int(parts[1])
                            val = int(tag_val.value) if isinstance(tag_val.value, (int, float)) else 0
                            
                            if reg_type == "HR":
                                self.store.setValues(3, addr, [val])
                            elif reg_type == "IR":
                                self.store.setValues(4, addr, [val])
                            elif reg_type == "CO":
                                self.store.setValues(1, addr, [val])
                            elif reg_type == "DI":
                                self.store.setValues(2, addr, [val])
                        except ValueError:
                            pass
            except Exception as e:
                logging.error(f"Error syncing Modbus store: {e}")
            await asyncio.sleep(0.5)

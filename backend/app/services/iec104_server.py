import asyncio
import logging
import c104
from app.core.store import GlobalDataStore

class IEC104ServerService:
    def __init__(self):
        self.port = 2404
        self.ip = "0.0.0.0"
        self.server = None
        self.station = None
        self.running = False
        self.mapped_points = {} # tag_id -> point

    async def start(self):
        # Load config from DB
        await self._load_config()
        
        # Start the server in a background task
        asyncio.create_task(self._run_server())
        # Start sync task
        asyncio.create_task(self._sync_store())

    async def _load_config(self):
        from app.core.database import SessionLocal
        from app.models import models
        
        try:
            db = SessionLocal()
            config = db.query(models.ServerConfig).filter(models.ServerConfig.type == "IEC104_SERVER").first()
            if config and config.enabled:
                self.port = int(config.config.get("port", 2404))
                self.ip = config.config.get("ip", "0.0.0.0")
            db.close()
        except Exception as e:
            logging.error(f"Error loading IEC 104 Server config: {e}")

    async def _run_server(self):
        logging.info(f"Starting IEC 104 Server on {self.ip}:{self.port}")
        
        try:
            self.server = c104.Server(ip=self.ip, port=self.port)
            # Create a station (ASDU)
            # Common Address of ASDU (CA) defaults to 1 usually, make it configurable if needed
            self.station = self.server.add_station(common_address=1)
            
            self.server.start()
            self.running = True
            
            while True:
                await asyncio.sleep(1)
                if not self.running:
                    break
        except Exception as e:
            logging.error(f"Error running IEC 104 Server: {e}")
            self.running = False

    async def _sync_store(self):
        from app.core.database import SessionLocal
        from app.models import models
        
        global_store = GlobalDataStore()
        
        while True:
            if not self.running or not self.station:
                await asyncio.sleep(1)
                continue

            try:
                mappings = []
                try:
                    db = SessionLocal()
                    config = db.query(models.ServerConfig).filter(models.ServerConfig.type == "IEC104_SERVER").first()
                    if config and config.enabled:
                        mappings = config.config.get("mappings", [])
                    db.close()
                except Exception as e:
                    logging.error(f"Error reloading IEC 104 config: {e}")

                if not mappings:
                    await asyncio.sleep(2)
                    continue

                tags = await global_store.get_all_tags()
                
                # Also load tag params from database for bit manipulation and scaling
                tag_params_map = {}
                try:
                    db = SessionLocal()
                    db_tags = db.query(models.Tag).filter(models.Tag.enabled == True).all()
                    for db_tag in db_tags:
                        if db_tag.params:
                            tag_params_map[db_tag.tag_id] = db_tag.params
                    db.close()
                except Exception as e:
                    logging.error(f"Error loading tag params: {e}")
                
                for mapping in mappings:
                    tag_id = mapping.get("tag_id")
                    if tag_id not in tags:
                        continue
                        
                    tag_val = tags[tag_id]
                    val = tag_val.value
                    
                    # Get tag params for processing
                    params = tag_params_map.get(tag_id, {})
                    
                    # Apply bit extraction if configured
                    if val is not None and params.get("start_bit") is not None and params.get("length") is not None:
                        try:
                            start_bit = int(params["start_bit"])
                            length = int(params["length"])
                            # Extract bits from integer value
                            int_val = int(val)
                            mask = (1 << length) - 1  # Create mask for length bits
                            val = (int_val >> start_bit) & mask
                        except Exception as e:
                            logging.error(f"Error extracting bits for {tag_id}: {e}")
                    
                    # Apply span scaling if configured
                    if val is not None and params.get("span_low") is not None and params.get("span_high") is not None:
                        try:
                            span_low = float(params["span_low"])
                            span_high = float(params["span_high"])
                            # Assuming raw value is 0-65535 (16-bit), scale to span range
                            # You can adjust this based on your raw value range
                            raw_min = 0
                            raw_max = 65535
                            if isinstance(val, (int, float)):
                                val = span_low + (float(val) - raw_min) * (span_high - span_low) / (raw_max - raw_min)
                        except Exception as e:
                            logging.error(f"Error scaling value for {tag_id}: {e}")
                    
                    # IOA (Information Object Address)
                    ioa = int(mapping.get("ioa", 0))
                    type_id = mapping.get("type_id", "M_ME_NC_1") # Default to Measured Value, Short Floating Point
                    
                    # Check if point exists
                    if tag_id not in self.mapped_points:
                        try:
                            # Create point based on type
                            point = None
                            if type_id == "M_SP_NA_1": # Single Point
                                point = self.station.add_point(ioa, c104.Type.M_SP_NA_1)
                            elif type_id == "M_DP_NA_1": # Double Point
                                point = self.station.add_point(ioa, c104.Type.M_DP_NA_1)
                            elif type_id == "M_ME_NC_1": # Measured Value, Short Float
                                point = self.station.add_point(ioa, c104.Type.M_ME_NC_1)
                            elif type_id == "M_ME_NB_1": # Measured Value, Scaled
                                point = self.station.add_point(ioa, c104.Type.M_ME_NB_1)
                            else:
                                # Default float
                                point = self.station.add_point(ioa, c104.Type.M_ME_NC_1)
                                
                            self.mapped_points[tag_id] = point
                            logging.info(f"Created IEC 104 point for {tag_id} at IOA {ioa}")
                        except Exception as e:
                            logging.error(f"Error creating point for {tag_id}: {e}")
                            continue
                    
                    # Update value
                    if val is not None:
                        try:
                            point = self.mapped_points[tag_id]
                            point.value = val
                            # Report cause: Spontaneous
                            point.transmit(cause=c104.Cause.SPONTANEOUS)
                        except Exception as e:
                            # logging.error(f"Error updating point {tag_id}: {e}")
                            pass
                            
            except Exception as e:
                logging.error(f"Error syncing IEC 104 store: {e}")
            
            await asyncio.sleep(0.5)

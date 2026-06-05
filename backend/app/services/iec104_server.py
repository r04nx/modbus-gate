import asyncio
import logging
import c104
from app.core.store import GlobalDataStore

class IEC104ServerService:
    """
    IEC 60870-5-104 Server Service
    
    Supports all standard monitoring type IDs:
    - M_SP_NA_1: Single Point Information
    - M_DP_NA_1: Double Point Information
    - M_ST_NA_1: Step Position Information
    - M_BO_NA_1: Bitstring of 32 bits
    - M_ME_NA_1: Measured Value, Normalized (-1.0 to +1.0)
    - M_ME_NB_1: Measured Value, Scaled (-32768 to +32767)
    - M_ME_NC_1: Measured Value, Short Floating Point
    - M_ME_ND_1: Measured Value, Normalized without quality
    """
    
    def __init__(self):
        self.port = 2404
        self.ip = "0.0.0.0"
        self.common_address = 1
        self.server = None
        self.station = None
        self.running = False
        self.mapped_points = {}  # tag_id -> point
        
        # Type ID mapping for logging
        self.type_names = {
            "M_SP_NA_1": "Single Point",
            "M_DP_NA_1": "Double Point",
            "M_ST_NA_1": "Step Position",
            "M_BO_NA_1": "Bitstring 32",
            "M_ME_NA_1": "Normalized Value",
            "M_ME_NB_1": "Scaled Value",
            "M_ME_NC_1": "Float Value",
            "M_ME_ND_1": "Normalized (No Quality)"
        }

    async def start(self):
        """Initialize and start the IEC 104 server"""
        await self._load_config()
        asyncio.create_task(self._run_server())
        asyncio.create_task(self._sync_store())

    async def _load_config(self):
        """Load configuration from database"""
        from app.core.database import SessionLocal
        from app.models import models
        
        try:
            db = SessionLocal()
            config = db.query(models.ServerConfig).filter(
                models.ServerConfig.type == "IEC104_SERVER"
            ).first()
            
            if config and config.enabled:
                self.port = int(config.config.get("port", 2404))
                self.ip = config.config.get("ip", "0.0.0.0")
                self.common_address = int(config.config.get("common_address", 1))
                logging.info(f"IEC 104 Server config loaded: {self.ip}:{self.port}, CA={self.common_address}")
            db.close()
        except Exception as e:
            logging.error(f"Error loading IEC 104 Server config: {e}")

    async def _run_server(self):
        """Run the IEC 104 server"""
        logging.info(f"Starting IEC 104 Server on {self.ip}:{self.port} (CA={self.common_address})")
        
        try:
            self.server = c104.Server(ip=self.ip, port=self.port)
            self.station = self.server.add_station(common_address=self.common_address)
            
            self.server.start()
            self.running = True
            logging.info(f"✓ IEC 104 Server started successfully")
            
            while True:
                await asyncio.sleep(1)
                if not self.running:
                    break
        except Exception as e:
            logging.error(f"Error running IEC 104 Server: {e}")
            self.running = False

    def _convert_value_for_type(self, value, type_id, tag_id):
        """
        Convert tag value to appropriate format for IEC 104 type
        
        Args:
            value: Raw value from tag
            type_id: IEC 104 type identifier
            tag_id: Tag identifier for logging
            
        Returns:
            Converted value suitable for the type
        """
        if value is None:
            return None
            
        try:
            if type_id == "M_SP_NA_1":  # Single Point (Boolean)
                # Convert to boolean
                if isinstance(value, str):
                    return value.lower() in ('true', '1', 'on', 'yes')
                return bool(int(float(value)))
                
            elif type_id == "M_DP_NA_1":  # Double Point (0-3)
                # 0=INTERMEDIATE, 1=OFF, 2=ON, 3=INDETERMINATE
                int_val = int(float(value))
                return max(0, min(3, int_val))
                
            elif type_id == "M_ST_NA_1":  # Step Position (-64 to +63)
                int_val = int(float(value))
                return max(-64, min(63, int_val))
                
            elif type_id == "M_BO_NA_1":  # Bitstring of 32 bits
                return int(float(value)) & 0xFFFFFFFF
                
            elif type_id in ("M_ME_NA_1", "M_ME_ND_1"):  # Normalized (-1.0 to +1.0)
                float_val = float(value)
                # If value is outside range, normalize it
                if float_val < -1.0 or float_val > 1.0:
                    # Assume it's a percentage (0-100) and normalize
                    if 0 <= float_val <= 100:
                        return (float_val / 50.0) - 1.0
                return max(-1.0, min(1.0, float_val))
                
            elif type_id == "M_ME_NB_1":  # Scaled (-32768 to +32767)
                int_val = int(float(value))
                return max(-32768, min(32767, int_val))
                
            elif type_id == "M_ME_NC_1":  # Short Float
                return float(value)
                
            else:
                # Default to float
                return float(value)
                
        except (ValueError, TypeError) as e:
            logging.warning(f"Value conversion error for {tag_id} (type={type_id}): {e}")
            return None

    async def _sync_store(self):
        """Synchronize tag values with IEC 104 points"""
        from app.core.database import SessionLocal
        from app.models import models
        import time
        
        global_store = GlobalDataStore()
        last_mapping_count = 0
        
        last_config_load = 0.0
        mappings = []
        tag_params_map = {}
        
        while True:
            if not self.running or not self.station:
                await asyncio.sleep(1)
                continue

            try:
                now = time.time()
                # Load mappings and tag params from database every 5 seconds
                if now - last_config_load > 5.0 or not mappings:
                    try:
                        db = SessionLocal()
                        config = db.query(models.ServerConfig).filter(
                            models.ServerConfig.type == "IEC104_SERVER"
                        ).first()
                        
                        if config and config.enabled:
                            mappings = config.config.get("mappings", [])
                        
                        # Load tag parameters for bit manipulation and scaling
                        tag_params_map = {}
                        db_tags = db.query(models.Tag).filter(models.Tag.enabled == True).all()
                        for db_tag in db_tags:
                            if db_tag.params:
                                tag_params_map[db_tag.tag_id] = db_tag.params
                                
                        db.close()
                        last_config_load = now
                    except Exception as e:
                        logging.error(f"Error reloading IEC 104 config: {e}")

                # Log mapping count changes
                if len(mappings) != last_mapping_count:
                    logging.info(f"IEC 104 mappings: {len(mappings)} points configured")
                    last_mapping_count = len(mappings)

                if not mappings:
                    await asyncio.sleep(2)
                    continue

                # Get all tag values
                tags = await global_store.get_all_tags()
                
                # Process each mapping
                for mapping in mappings:
                    tag_id = mapping.get("tag_id")
                    if tag_id not in tags:
                        continue
                        
                    tag_val = tags[tag_id]
                    val = tag_val.value
                    quality = tag_val.quality
                    
                    # Get tag params for processing
                    params = tag_params_map.get(tag_id, {})
                    
                    # Apply bit extraction if configured
                    if val is not None and params.get("start_bit") is not None and params.get("length") is not None:
                        try:
                            start_bit = int(params["start_bit"])
                            length = int(params["length"])
                            int_val = int(val)
                            mask = (1 << length) - 1
                            val = (int_val >> start_bit) & mask
                        except Exception as e:
                            logging.error(f"Bit extraction error for {tag_id}: {e}")
                    
                    # Apply span scaling if configured
                    if val is not None and params.get("span_low") is not None and params.get("span_high") is not None:
                        try:
                            span_low = float(params["span_low"])
                            span_high = float(params["span_high"])
                            raw_min = 0
                            raw_max = 65535
                            if isinstance(val, (int, float)):
                                val = span_low + (float(val) - raw_min) * (span_high - span_low) / (raw_max - raw_min)
                        except Exception as e:
                            logging.error(f"Span scaling error for {tag_id}: {e}")
                    
                    # Get IOA and Type ID
                    base_value = int(mapping.get("base_value", 0))
                    ioa_offset = int(mapping.get("ioa", 0))
                    ioa = base_value + ioa_offset  # Computed IOA
                    type_id = mapping.get("type_id", "M_ME_NC_1")
                    soe = mapping.get("soe", False)  # Sequence of Events
                    cot_str = mapping.get("cot", "SPONTANEOUS")  # Cause of Transmission
                    
                    # Map CoT string to c104.Cot enum
                    cot_map = {
                        "SPONTANEOUS": c104.Cot.SPONTANEOUS,
                        "PERIODIC": c104.Cot.PERIODIC,
                        "INTERROGATED": c104.Cot.INTERROGATED_BY_STATION,
                        "REQUEST": c104.Cot.REQUEST
                    }
                    cot = cot_map.get(cot_str, c104.Cot.SPONTANEOUS)
                    
                    # Create point if it doesn't exist
                    if tag_id not in self.mapped_points:
                        try:
                            point = None
                            type_name = self.type_names.get(type_id, type_id)
                            
                            if type_id == "M_SP_NA_1":
                                point = self.station.add_point(ioa, c104.Type.M_SP_NA_1)
                            elif type_id == "M_DP_NA_1":
                                point = self.station.add_point(ioa, c104.Type.M_DP_NA_1)
                            elif type_id == "M_ST_NA_1":
                                point = self.station.add_point(ioa, c104.Type.M_ST_NA_1)
                            elif type_id == "M_BO_NA_1":
                                point = self.station.add_point(ioa, c104.Type.M_BO_NA_1)
                            elif type_id == "M_ME_NA_1":
                                point = self.station.add_point(ioa, c104.Type.M_ME_NA_1)
                            elif type_id == "M_ME_NB_1":
                                point = self.station.add_point(ioa, c104.Type.M_ME_NB_1)
                            elif type_id == "M_ME_NC_1":
                                point = self.station.add_point(ioa, c104.Type.M_ME_NC_1)
                            elif type_id == "M_ME_ND_1":
                                point = self.station.add_point(ioa, c104.Type.M_ME_ND_1)
                            else:
                                # Default to float
                                point = self.station.add_point(ioa, c104.Type.M_ME_NC_1)
                                logging.warning(f"Unknown type {type_id}, defaulting to M_ME_NC_1")
                                
                            self.mapped_points[tag_id] = point
                            soe_str = " [SOE]" if soe else ""
                            if base_value > 0:
                                logging.info(f"✓ Created IEC 104 point: {tag_id} → IOA {ioa} (base:{base_value}+{ioa_offset}) ({type_name}){soe_str}")
                            else:
                                logging.info(f"✓ Created IEC 104 point: {tag_id} → IOA {ioa} ({type_name}){soe_str}")
                        except Exception as e:
                            logging.error(f"Error creating point for {tag_id}: {e}")
                            continue
                    
                    # Update value
                    if val is not None:
                        try:
                            point = self.mapped_points[tag_id]
                            
                            # Convert value to appropriate type
                            converted_val = self._convert_value_for_type(val, type_id, tag_id)
                            
                            if converted_val is not None:
                                point.value = converted_val
                                
                                # Set quality based on tag quality
                                # Note: c104 library handles quality internally
                                # Transmit with configured cause (SPONTANEOUS, PERIODIC, etc.)
                                point.transmit(cause=cot)
                        except Exception as e:
                            # Suppress frequent errors to avoid log spam
                            pass
                            
            except Exception as e:
                logging.error(f"Error syncing IEC 104 store: {e}")
            
            await asyncio.sleep(1.0)


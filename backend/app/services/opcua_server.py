import asyncio
import logging
from asyncua import Server, ua
from app.core.store import GlobalDataStore

# Enable verbose asyncua logging for debugging
logging.getLogger('asyncua').setLevel(logging.WARNING)

class OPCUAServerService:
    def __init__(self):
        self.port = 4840
        self.endpoint = "opc.tcp://0.0.0.0:4840/vistaiot/server/"
        self.server = Server()
        self.server_task = None
        self.running = False
        self.namespace_idx = 2
        self.mapped_nodes = {} # tag_id -> node
        self.folders_cache = {} # cache for dynamic folders
        self._last_mappings_hash = None # detect config changes

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
            config = db.query(models.ServerConfig).filter(models.ServerConfig.type == "OPC_UA_SERVER").first()
            if config and config.enabled:
                raw_port = config.config.get("port")
                self.port = int(raw_port) if raw_port else 4840
                
                raw_endpoint = config.config.get("endpoint")
                self.endpoint = raw_endpoint if raw_endpoint else f"opc.tcp://0.0.0.0:{self.port}/vistaiot/server/"
            db.close()
        except Exception as e:
            logging.error(f"Error loading OPC UA Server config: {e}")

    async def _run_server(self):
        logging.info(f"Starting OPC UA Server on {self.endpoint}")
        
        try:
            await self.server.init()
            self.server.set_endpoint(self.endpoint)
            self.server.set_server_name("VistaIOT OPC UA Server")
            
            # Setup namespace
            uri = "http://vistaiot.com"
            self.namespace_idx = await self.server.register_namespace(uri)
            
            # Initialize Root folders cache
            objects = self.server.nodes.objects
            self.folders_cache = {}
            
            async with self.server:
                self.running = True
                while True:
                    await asyncio.sleep(1)
                    if not self.running:
                        break
        except Exception as e:
            logging.error(f"Error running OPC UA Server: {e}")
            self.running = False

    async def _sync_store(self):
        from app.core.database import SessionLocal
        from app.models import models
        
        global_store = GlobalDataStore()
        
        while True:
            try:
                # Reload config to check for changes
                mappings = []
                new_port = self.port
                new_endpoint = self.endpoint
                new_enabled = False
                
                try:
                    db = SessionLocal()
                    config = db.query(models.ServerConfig).filter(models.ServerConfig.type == "OPC_UA_SERVER").first()
                    if config:
                        new_enabled = config.enabled
                        
                        raw_port = config.config.get("port")
                        new_port = int(raw_port) if raw_port else 4840
                        
                        raw_endpoint = config.config.get("endpoint")
                        new_endpoint = raw_endpoint if raw_endpoint else f"opc.tcp://0.0.0.0:{new_port}/vistaiot/server/"
                        
                        if new_enabled:
                            mappings = config.config.get("mappings", [])
                    db.close()
                except Exception as e:
                    logging.error(f"Error reloading OPC UA config: {e}")

                # Check if restart is needed
                restart_needed = False
                if new_enabled != self.running:
                    restart_needed = True
                elif new_enabled and (new_port != self.port or new_endpoint != self.endpoint):
                    restart_needed = True
                elif new_enabled and self.running:
                    # Also restart if mappings group structure changed
                    import json as _json
                    new_mappings_hash = hash(_json.dumps(
                        [(m.get("tag_id"), m.get("node_name"), m.get("group_name", "Tags")) for m in mappings],
                        sort_keys=True
                    ))
                    if self._last_mappings_hash is not None and new_mappings_hash != self._last_mappings_hash:
                        logging.info("OPC UA mappings/groups changed — restarting server to rebuild tree...")
                        restart_needed = True
                    self._last_mappings_hash = new_mappings_hash

                if restart_needed:
                    logging.info(f"OPC UA Config changed. Restarting server... (Enabled: {new_enabled}, Port: {new_port})")
                    
                    # Stop existing server
                    if self.server_task:
                        self.running = False
                        try:
                            await self.server.stop()
                        except:
                            pass
                        self.server_task.cancel()
                        try:
                            await self.server_task
                        except asyncio.CancelledError:
                            pass
                        self.server_task = None

                    # Update config
                    self.port = new_port
                    self.endpoint = new_endpoint
                    
                    # Start new server if enabled
                    if new_enabled:
                        self.server = Server() # Create new server instance to be safe
                        self.server_task = asyncio.create_task(self._run_server())
                    
                    # Wait a bit for server to start
                    await asyncio.sleep(2)
                    continue

                if not self.running or not mappings:
                    await asyncio.sleep(1)
                    continue

                tags = await global_store.get_all_tags()
                
                # Check for new mappings or removed mappings
                for mapping in mappings:
                    tag_id = mapping.get("tag_id")
                    if tag_id not in tags:
                        continue
                        
                    tag_val = tags[tag_id]
                    val = tag_val.value
                    
                    # Node Name/ID
                    node_name = mapping.get("node_name", tag_id)
                    group_name = mapping.get("group_name", "Tags")
                    
                    # Check if node exists
                    if tag_id not in self.mapped_nodes:
                        # Create node
                        try:
                            # Determine type
                            initial_val = val if val is not None else 0.0
                            
                            # Create variable with STRING NodeId (not numeric)
                            # This ensures the node is accessible via ns=2;s=node_name
                            from asyncua import ua
                            node_id = ua.NodeId(node_name, self.namespace_idx, ua.NodeIdType.String)
                            
                            # Dynamically resolve Group Path hierarchical folders
                            parts = [p.strip() for p in group_name.split("/") if p.strip()]
                            if not parts:
                                parts = ["Tags"]
                                
                            current_folder = self.server.nodes.objects
                            current_path_str = ""
                            
                            for part in parts:
                                current_path_str = f"{current_path_str}/{part}" if current_path_str else part
                                if current_path_str not in self.folders_cache:
                                    new_folder = await current_folder.add_folder(self.namespace_idx, part)
                                    self.folders_cache[current_path_str] = new_folder
                                current_folder = self.folders_cache[current_path_str]
                            
                            node = await current_folder.add_variable(node_id, node_name, initial_val)
                            await node.set_writable()
                            self.mapped_nodes[tag_id] = node
                            logging.info(f"Created OPC UA node for {tag_id} as {node_name} under {group_name} with NodeId ns={self.namespace_idx};s={node_name}")
                        except Exception as e:
                            logging.error(f"Error creating node for {tag_id}: {e}")
                            continue
                    
                    # Update value
                    if val is not None and tag_id in self.mapped_nodes:
                        try:
                            node = self.mapped_nodes[tag_id]
                            await node.write_value(val)
                        except Exception as e:
                            # Node might be invalid if server restarted
                            if "BadSessionIdInvalid" in str(e) or "BadSecureChannelIdInvalid" in str(e):
                                self.mapped_nodes = {} # Clear cache to force recreation
                                self.folders_cache = {}
                            pass
                            
            except Exception as e:
                logging.error(f"Error syncing OPC UA store: {e}")
            
            await asyncio.sleep(0.5)

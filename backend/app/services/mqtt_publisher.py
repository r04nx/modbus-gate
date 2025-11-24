import asyncio
import logging
import json
import time
import ssl
import tempfile
import os
import paho.mqtt.client as mqtt
from app.core.store import GlobalDataStore

class MQTTPublisherService:
    def __init__(self):
        self.brokers = {} # broker_id -> mqtt.Client
        self.running = False
        self.last_publish = {} # publication_id -> last_publish_time
        self.temp_cert_files = {} # broker_id -> list of temp file paths

    async def start(self):
        # Load config from DB
        await self._load_config()
        
        # Start the publisher loop
        asyncio.create_task(self._run_publisher())

    async def _load_config(self):
        # Initial load, real logic is in the loop to handle dynamic updates
        pass
    
    def _load_certificates(self, cert_id, db):
        """Load certificates from database"""
        from app.models import models
        
        cert = db.query(models.Certificate).filter(models.Certificate.id == cert_id).first()
        if not cert:
            raise Exception(f"Certificate {cert_id} not found")
        
        return {
            "ca_cert": cert.ca_cert,
            "client_cert": cert.client_cert,
            "client_key": cert.client_key
        }
    
    def _write_temp_cert(self, cert_data, prefix="cert"):
        """Write certificate data to a temporary file"""
        if not cert_data:
            return None
        
        # Create temp file with restricted permissions
        fd, path = tempfile.mkstemp(prefix=f"mqtt_{prefix}_", suffix=".pem")
        try:
            # Write certificate data
            os.write(fd, cert_data)
            os.close(fd)
            # Set restrictive permissions (owner read-only)
            os.chmod(path, 0o400)
            return path
        except Exception as e:
            os.close(fd)
            if os.path.exists(path):
                os.unlink(path)
            raise e
    
    def _cleanup_temp_certs(self, broker_id):
        """Clean up temporary certificate files for a broker"""
        if broker_id in self.temp_cert_files:
            for path in self.temp_cert_files[broker_id]:
                try:
                    if os.path.exists(path):
                        os.unlink(path)
                except Exception as e:
                    logging.warning(f"Failed to delete temp cert {path}: {e}")
            del self.temp_cert_files[broker_id]

    async def _run_publisher(self):
        logging.info("Starting MQTT Publisher Service")
        self.running = True
        
        from app.core.database import SessionLocal
        from app.models import models
        
        global_store = GlobalDataStore()
        
        while True:
            if not self.running:
                await asyncio.sleep(1)
                continue

            try:
                # Reload config
                config_data = {}
                db = None
                try:
                    db = SessionLocal()
                    config = db.query(models.ServerConfig).filter(models.ServerConfig.type == "MQTT_PUBLISHER").first()
                    if config and config.enabled:
                        config_data = config.config
                except Exception as e:
                    logging.error(f"Error reloading MQTT config: {e}")
                    if db:
                        db.close()
                    await asyncio.sleep(2)
                    continue

                if not config_data:
                    if db:
                        db.close()
                    await asyncio.sleep(2)
                    continue

                brokers_config = config_data.get("brokers", [])
                publications = config_data.get("publications", [])

                # Manage Brokers
                current_broker_ids = set()
                for broker_cfg in brokers_config:
                    b_id = broker_cfg.get("id")
                    current_broker_ids.add(b_id)
                    
                    if b_id not in self.brokers:
                        # Create new client
                        client = mqtt.Client(client_id=broker_cfg.get("client_id", f"vistaiot_{b_id}"))
                        
                        # Set username/password if provided
                        if broker_cfg.get("username"):
                            client.username_pw_set(broker_cfg.get("username"), broker_cfg.get("password"))
                        
                        # Configure TLS if enabled
                        if broker_cfg.get("use_tls", False):
                            cert_id = broker_cfg.get("certificate_id")
                            if cert_id:
                                try:
                                    # Load certificates from database
                                    certs = self._load_certificates(cert_id, db)
                                    
                                    # Write certificates to temp files
                                    temp_files = []
                                    ca_path = self._write_temp_cert(certs["ca_cert"], "ca")
                                    cert_path = self._write_temp_cert(certs["client_cert"], "cert")
                                    key_path = self._write_temp_cert(certs["client_key"], "key")
                                    
                                    if ca_path:
                                        temp_files.append(ca_path)
                                    if cert_path:
                                        temp_files.append(cert_path)
                                    if key_path:
                                        temp_files.append(key_path)
                                    
                                    self.temp_cert_files[b_id] = temp_files
                                    
                                    # Configure TLS
                                    client.tls_set(
                                        ca_certs=ca_path,
                                        certfile=cert_path,
                                        keyfile=key_path,
                                        tls_version=ssl.PROTOCOL_TLSv1_2
                                    )
                                    
                                    # Optionally disable hostname verification (for self-signed certs)
                                    if broker_cfg.get("tls_insecure", False):
                                        client.tls_insecure_set(True)
                                    
                                    logging.info(f"TLS configured for broker {b_id} with certificate {cert_id}")
                                    
                                except Exception as e:
                                    logging.error(f"Error configuring TLS for broker {b_id}: {e}")
                                    self._cleanup_temp_certs(b_id)
                                    continue
                            else:
                                logging.warning(f"TLS enabled for broker {b_id} but no certificate_id provided")
                        
                        try:
                            port = int(broker_cfg.get("port", 8883 if broker_cfg.get("use_tls") else 1883))
                            client.connect(broker_cfg.get("host", "localhost"), port)
                            client.loop_start()
                            self.brokers[b_id] = client
                            logging.info(f"Connected to MQTT broker {b_id} at {broker_cfg.get('host')}:{port} (TLS: {broker_cfg.get('use_tls', False)})")
                        except Exception as e:
                            logging.error(f"Error connecting to broker {b_id}: {e}")
                            self._cleanup_temp_certs(b_id)
                
                # Close database connection
                if db:
                    db.close()
                
                # Cleanup removed brokers
                for b_id in list(self.brokers.keys()):
                    if b_id not in current_broker_ids:
                        self.brokers[b_id].loop_stop()
                        self.brokers[b_id].disconnect()
                        del self.brokers[b_id]
                        # Clean up temp certificates
                        self._cleanup_temp_certs(b_id)

                # Process Publications
                current_time = time.time()
                tags = await global_store.get_all_tags()

                for pub in publications:
                    pub_id = pub.get("id")
                    interval = int(pub.get("interval", 5))
                    
                    last_time = self.last_publish.get(pub_id, 0)
                    if current_time - last_time < interval:
                        continue
                        
                    # Time to publish
                    broker_id = pub.get("broker_id")
                    if broker_id not in self.brokers:
                        continue
                        
                    topic = pub.get("topic")
                    template = pub.get("payload_template", "{}")
                    
                    # Generate Payload
                    try:
                        # Simple template replacement
                        # We expect template to be a JSON string with placeholders like {{tag_id}}
                        
                        payload_str = template
                        
                        # Replace timestamps
                        payload_str = payload_str.replace("{{timestamp}}", str(int(current_time)))
                        payload_str = payload_str.replace("{{timestamp_ms}}", str(int(current_time * 1000)))
                        
                        # Replace tags
                        pub_tags = pub.get("tags", [])
                        
                        # If template is just "{}", we build a dict from configured tags
                        if template.strip() == "{}":
                            data = {}
                            if "timestamp" in pub.get("options", []):
                                data["timestamp"] = int(current_time * 1000)
                                
                            for tag_id in pub_tags:
                                if tag_id in tags:
                                    data[tag_id] = tags[tag_id].value
                            payload_str = json.dumps(data)
                        else:
                            # String replacement - find all {{tag_id}} patterns and replace with values
                            import re
                            
                            # Find all {{...}} patterns
                            pattern = r'\{\{([^}]+)\}\}'
                            matches = re.findall(pattern, payload_str)
                            
                            for tag_id in matches:
                                # Skip timestamp placeholders (already handled)
                                if tag_id in ['timestamp', 'timestamp_ms']:
                                    continue
                                    
                                # Replace with actual tag value if it exists
                                if tag_id in tags:
                                    val = tags[tag_id].value
                                    # Convert value to string, handling different types
                                    if isinstance(val, str):
                                        val_str = f'"{val}"'  # Add quotes for JSON strings
                                    elif isinstance(val, (int, float)):
                                        val_str = str(val)
                                    elif isinstance(val, bool):
                                        val_str = 'true' if val else 'false'
                                    else:
                                        val_str = json.dumps(val)
                                    
                                    payload_str = payload_str.replace(f"{{{{{tag_id}}}}}", val_str)
                                else:
                                    # Tag not found, replace with null
                                    payload_str = payload_str.replace(f"{{{{{tag_id}}}}}", "null")
                        
                        self.brokers[broker_id].publish(topic, payload_str)
                        self.last_publish[pub_id] = current_time
                        
                    except Exception as e:
                        logging.error(f"Error publishing {pub_id}: {e}")

            except Exception as e:
                logging.error(f"Error in MQTT Publisher loop: {e}")
            
            await asyncio.sleep(0.5)

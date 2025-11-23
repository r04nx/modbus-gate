import asyncio
import logging
import json
import time
import paho.mqtt.client as mqtt
from app.core.store import GlobalDataStore

class MQTTPublisherService:
    def __init__(self):
        self.brokers = {} # broker_id -> mqtt.Client
        self.running = False
        self.last_publish = {} # publication_id -> last_publish_time

    async def start(self):
        # Load config from DB
        await self._load_config()
        
        # Start the publisher loop
        asyncio.create_task(self._run_publisher())

    async def _load_config(self):
        # Initial load, real logic is in the loop to handle dynamic updates
        pass

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
                try:
                    db = SessionLocal()
                    config = db.query(models.ServerConfig).filter(models.ServerConfig.type == "MQTT_PUBLISHER").first()
                    if config and config.enabled:
                        config_data = config.config
                    db.close()
                except Exception as e:
                    logging.error(f"Error reloading MQTT config: {e}")

                if not config_data:
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
                        if broker_cfg.get("username"):
                            client.username_pw_set(broker_cfg.get("username"), broker_cfg.get("password"))
                        
                        try:
                            client.connect(broker_cfg.get("host", "localhost"), int(broker_cfg.get("port", 1883)))
                            client.loop_start()
                            self.brokers[b_id] = client
                            logging.info(f"Connected to MQTT broker {b_id}")
                        except Exception as e:
                            logging.error(f"Error connecting to broker {b_id}: {e}")
                
                # Cleanup removed brokers
                for b_id in list(self.brokers.keys()):
                    if b_id not in current_broker_ids:
                        self.brokers[b_id].loop_stop()
                        self.brokers[b_id].disconnect()
                        del self.brokers[b_id]

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

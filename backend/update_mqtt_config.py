import sys
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import models
from app.core.database import SQLALCHEMY_DATABASE_URL

# Setup DB connection
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

try:
    # Get MQTT config
    config = db.query(models.ServerConfig).filter(models.ServerConfig.type == "MQTT_PUBLISHER").first()
    if not config:
        print("MQTT config not found")
        sys.exit(1)

    data = config.config
    brokers = data.get("brokers", [])
    updated = False
    
    for broker in brokers:
        if broker.get("host") == "test.mosquitto.org":
            print(f"Updating broker {broker.get('id')} to use port 8883 and TLS")
            broker["port"] = 8883
            broker["use_tls"] = True
            broker["tls_insecure"] = True # For test.mosquitto.org without verifying CA strictly if needed, or just to be safe
            updated = True

    if updated:
        config.config = data
        # Force update since it's a JSON field and SQLAlchemy might not detect mutation
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(config, "config")
        
        db.commit()
        print("Successfully updated MQTT configuration")
    else:
        print("No broker found matching test.mosquitto.org")

except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
finally:
    db.close()

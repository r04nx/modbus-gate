
from app.core.database import SessionLocal
from app.models import models
import json

db = SessionLocal()
try:
    devices = db.query(models.Device).all()
    for d in devices:
        params = d.connection_params
        if params and params.get('host') == '10.0.0.15':
            print(f"FOUND DEVICE: ID={d.id}, Name='{d.name}', Enabled={d.enabled}, Type={d.type}")
            print(f"Params: {json.dumps(params, indent=2)}")
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()

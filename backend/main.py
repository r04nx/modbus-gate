from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.api import api_router
from app.core.database import engine, Base
import logging

# Configure logging
from app.core.log_handler import memory_handler

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
# Add memory handler to root logger
logging.getLogger().addHandler(memory_handler)

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="VistaIOT Backend")

# CORS
# CORS
# Allow all origins with credentials using regex
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex="https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

@app.on_event("startup")
async def startup_event():
    from app.services.system_tags import SystemTagService
    from app.services.modbus_server import ModbusServerService
    
    # Start System Tags
    sys_tags = SystemTagService()
    await sys_tags.start()
    
    # Start Modbus Server
    modbus_server = ModbusServerService()
    await modbus_server.start()
    
    # Start Polling Engine
    from app.services.polling import PollingEngine
    polling_engine = PollingEngine()
    await polling_engine.start()

    # Start Calculation Engine
    from app.services.calculation_engine import CalculationEngine
    calc_engine = CalculationEngine()
    await calc_engine.start()

    # Initialize User Tags
    from app.services.user_tags import UserTagService
    user_tags_service = UserTagService()
    await user_tags_service.start()

    # Start OPC UA Server
    from app.services.opcua_server import OPCUAServerService
    opcua_server = OPCUAServerService()
    await opcua_server.start()

    # Start IEC 104 Server
    from app.services.iec104_server import IEC104ServerService
    iec104_server = IEC104ServerService()
    await iec104_server.start()

    # Start MQTT Publisher
    from app.services.mqtt_publisher import MQTTPublisherService
    mqtt_publisher = MQTTPublisherService()
    await mqtt_publisher.start()

    # Start Buffering Service
    from app.services.buffering_service import buffering_service
    await buffering_service.start()

@app.get("/")
async def root():
    return {"message": "VistaIOT Backend is running"}

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.api import api_router
from app.core.database import engine, Base
import logging

# Configure logging
from app.core.log_handler import memory_handler

logging.basicConfig(
    level=logging.INFO,
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

from fastapi import Request, status
from fastapi.responses import JSONResponse
from app.core.license import verify_license

@app.middleware("http")
async def check_license(request: Request, call_next):
    # Allow health checks or license status endpoints if needed
    if request.url.path == "/api/v1/system/license-status":
        return await call_next(request)
        
    is_valid, hardware_id = verify_license()
    if not is_valid:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "detail": "LICENSE_INVALID",
                "hardware_id": hardware_id,
                "message": "This application is locked to specific hardware."
            }
        )
    return await call_next(request)

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

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Mount static files
app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")

@app.get("/")
async def root():
    return FileResponse('static/index.html')

@app.exception_handler(404)
async def custom_404_handler(_, __):
    return FileResponse('static/index.html')

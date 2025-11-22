from fastapi import APIRouter
from app.api.endpoints import devices, tags, operations, logs

api_router = APIRouter()
api_router.include_router(devices.router, prefix="/devices", tags=["devices"])
api_router.include_router(tags.router, prefix="/tags", tags=["tags"])
api_router.include_router(operations.router, prefix="/calc", tags=["calculations"])
api_router.include_router(logs.router, prefix="/logs", tags=["logs"])

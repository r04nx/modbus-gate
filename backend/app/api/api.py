from fastapi import APIRouter
from app.api.endpoints import devices, tags, operations, logs, servers

api_router = APIRouter()
api_router.include_router(devices.router, prefix="/devices", tags=["devices"])
api_router.include_router(tags.router, prefix="/tags", tags=["tags"])
api_router.include_router(operations.router, prefix="/operations", tags=["operations"])
api_router.include_router(logs.router, prefix="/logs", tags=["logs"])
api_router.include_router(servers.router, prefix="/servers", tags=["servers"])

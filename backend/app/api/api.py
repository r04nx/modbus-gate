from fastapi import APIRouter
from app.api.endpoints import tags, devices, servers, system
from app.api.endpoints import config, users, storage, network, logs

api_router = APIRouter()
api_router.include_router(tags.router, prefix="/tags", tags=["tags"])
api_router.include_router(devices.router, prefix="/devices", tags=["devices"])
api_router.include_router(servers.router, prefix="/servers", tags=["servers"])
api_router.include_router(system.router, prefix="/system", tags=["system"])


api_router.include_router(logs.router, prefix="/logs", tags=["logs"])

# Settings-related routers
api_router.include_router(config.router, prefix="/config", tags=["config"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(storage.router, prefix="/storage", tags=["storage"])
api_router.include_router(network.router, prefix="/network", tags=["network"])


from app.api.endpoints import terminal
api_router.include_router(terminal.router, prefix="/terminal", tags=["terminal"])

from app.api.endpoints import buffering
api_router.include_router(buffering.router, prefix="/buffering", tags=["buffering"])

from app.api.endpoints import operations
api_router.include_router(operations.router, prefix="/operations", tags=["operations"])

from app.api.endpoints import datastore
api_router.include_router(datastore.router, prefix="/datastore", tags=["datastore"])

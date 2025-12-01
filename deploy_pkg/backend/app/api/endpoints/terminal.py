import os
import pty
import fcntl
import struct
import termios
import asyncio
import logging
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.orm import Session
from ...core.database import get_db
from .system import get_setting

router = APIRouter()
logger = logging.getLogger(__name__)

@router.websocket("/ws")
async def terminal_websocket(websocket: WebSocket, db: Session = Depends(get_db)):
    await websocket.accept()
    
    try:
        # Check if terminal is enabled
        # Note: In a real WebSocket connection, Depends(get_db) creates a new session.
        # We need to make sure we close it or use a context manager if possible, 
        # but FastAPI handles Depends cleanup after the request/websocket handler finishes.
        
        enabled = get_setting("terminal_enabled", db, "false") == "true"
        if not enabled:
            await websocket.send_text("Terminal is disabled in settings.\r\n")
            await websocket.close(code=1008, reason="Terminal disabled")
            return

        # Create PTY
        master_fd, slave_fd = pty.openpty()
        
        # Spawn shell
        pid = os.fork()
        if pid == 0:
            # Child process
            os.setsid()
            os.dup2(slave_fd, 0)
            os.dup2(slave_fd, 1)
            os.dup2(slave_fd, 2)
            if master_fd > 2:
                os.close(master_fd)
            if slave_fd > 2:
                os.close(slave_fd)
            
            # Set TERM environment variable
            env = os.environ.copy()
            env["TERM"] = "xterm-256color"
            # We are running as the user the backend runs as (likely root based on previous context)
            # If we want to ensure we are in a specific directory:
            # os.chdir("/root") 
            
            os.execvpe("bash", ["bash"], env)
        else:
            # Parent process
            os.close(slave_fd)
            
            loop = asyncio.get_running_loop()
            
            def read_from_pty():
                try:
                    data = os.read(master_fd, 10240)
                    if data:
                        # Send as text (xterm.js expects string usually, or binary)
                        # We'll use text for simplicity, decoding as utf-8
                        asyncio.create_task(websocket.send_text(data.decode('utf-8', errors='ignore')))
                    else:
                        # EOF
                        pass
                except OSError:
                    pass

            loop.add_reader(master_fd, read_from_pty)
            
            try:
                while True:
                    data = await websocket.receive_text()
                    
                    # Handle resize events
                    if data.startswith('{"cols":'):
                        try:
                            resize = json.loads(data)
                            cols = resize.get("cols", 80)
                            rows = resize.get("rows", 24)
                            winsize = struct.pack("HHHH", rows, cols, 0, 0)
                            fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
                            continue
                        except:
                            pass
                    
                    # Write to PTY
                    os.write(master_fd, data.encode())
                    
            except WebSocketDisconnect:
                pass
            except Exception as e:
                logger.error(f"Terminal error: {e}")
            finally:
                loop.remove_reader(master_fd)
                os.close(master_fd)
                try:
                    os.kill(pid, 9)
                    os.waitpid(pid, 0)
                except:
                    pass
                    
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except:
            pass

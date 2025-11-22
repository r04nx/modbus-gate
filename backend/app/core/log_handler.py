import logging
import threading
from collections import deque
from datetime import datetime
from typing import List, Dict, Optional

class MemoryLogHandler(logging.Handler):
    """Custom logging handler that stores logs in memory"""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self, max_logs: int = 1000):
        if self._initialized:
            return
        super().__init__()
        self.max_logs = max_logs
        self.logs = deque(maxlen=max_logs)
        self._initialized = True
    
    def emit(self, record: logging.LogRecord):
        """Store log record in memory"""
        try:
            log_entry = {
                'timestamp': datetime.fromtimestamp(record.created).isoformat(),
                'level': record.levelname,
                'message': self.format(record),
                'module': record.module,
                'funcName': record.funcName,
                'lineno': record.lineno
            }
            with self._lock:
                self.logs.append(log_entry)
        except Exception:
            self.handleError(record)
    
    def get_logs(self, level: Optional[str] = None, limit: Optional[int] = None) -> List[Dict]:
        """Retrieve logs with optional filtering"""
        with self._lock:
            logs = list(self.logs)
        
        # Filter by level if specified
        if level and level != 'ALL':
            logs = [log for log in logs if log['level'] == level]
        
        # Limit number of logs
        if limit:
            logs = logs[-limit:]
        
        return logs
    
    def clear_logs(self):
        """Clear all stored logs"""
        with self._lock:
            self.logs.clear()


# Singleton instance
memory_handler = MemoryLogHandler()

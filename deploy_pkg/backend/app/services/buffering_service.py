import asyncio
import sqlite3
import time
import os
import logging
import subprocess
import csv
from datetime import datetime
from typing import List, Dict, Optional
from pathlib import Path
from sqlalchemy.orm import Session
from app.core.store import GlobalDataStore
from app.models.outage import Outage
from app.models.storage_policy import StoragePolicy, PolicyType

logger = logging.getLogger(__name__)

# Use environment variable or default to local directory
BUFFER_ROOT = Path(os.getenv("BUFFER_DIR", "buffered_data"))
BUFFER_DB_PATH = BUFFER_ROOT / "buffer.db"
BUFFER_FILES_DIR = BUFFER_ROOT / "files"

class BufferingService:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(BufferingService, cls).__new__(cls)
            cls._instance.initialized = False
        return cls._instance

    def __init__(self):
        if self.initialized:
            return
        self.initialized = True
        self.running = False
        self.buffering_active = False
        self.manual_override = False
        self.current_outage_start = None
        self.triggers = {
            "internet": False,
            "gateway": False,
            "mqtt": False,
            "manual": False
        }
        self.config = {
            "internet_trigger": False,
            "gateway_trigger": False,
            "mqtt_trigger": False
        }
        self.store = GlobalDataStore()
        self.init_db()
        self.ensure_dirs()

    def init_db(self):
        """Initialize the buffer database."""
        try:
            conn = sqlite3.connect(BUFFER_DB_PATH)
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS buffered_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL,
                    tag_id TEXT,
                    value TEXT,
                    quality TEXT
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_timestamp ON buffered_data (timestamp)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_tag_id ON buffered_data (tag_id)')
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Failed to initialize buffer DB: {e}")

    def ensure_dirs(self):
        """Ensure storage directories exist."""
        BUFFER_ROOT.mkdir(parents=True, exist_ok=True)
        BUFFER_FILES_DIR.mkdir(parents=True, exist_ok=True)

    async def start(self):
        """Start the buffering service loop."""
        if self.running:
            return
        self.running = True
        asyncio.create_task(self._run_loop())
        logger.info("Buffering Service started")

    async def stop(self):
        """Stop the buffering service."""
        self.running = False
        logger.info("Buffering Service stopped")

    async def _run_loop(self):
        """Main service loop."""
        while self.running:
            try:
                # Check triggers
                await self._check_triggers()
                
                # Determine if buffering should be active
                should_buffer = (
                    self.triggers["manual"] or
                    (self.config["internet_trigger"] and self.triggers["internet"]) or
                    (self.config["gateway_trigger"] and self.triggers["gateway"]) or
                    (self.config["mqtt_trigger"] and self.triggers["mqtt"])
                )

                if should_buffer:
                    if not self.buffering_active:
                        logger.info("Buffering STARTED")
                        self.current_outage_start = time.time()
                    self.buffering_active = True
                    await self._buffer_data()
                else:
                    if self.buffering_active:
                        logger.info("Buffering STOPPED")
                        # End of outage - export data
                        await self._handle_outage_end()
                    self.buffering_active = False
                    self.current_outage_start = None

            except Exception as e:
                logger.error(f"Error in buffering loop: {e}")
            
            await asyncio.sleep(1)

    async def _check_triggers(self):
        """Check status of all triggers."""
        # Internet (Ping 8.8.8.8)
        if self.config["internet_trigger"]:
            self.triggers["internet"] = not self._ping("8.8.8.8")

        # Gateway (Ping default gateway)
        if self.config["gateway_trigger"]:
            gateway = self._get_default_gateway()
            if gateway:
                self.triggers["gateway"] = not self._ping(gateway)
            else:
                self.triggers["gateway"] = True # No gateway = disconnected

        # MQTT (Check client status - simplified for now)
        # self.triggers["mqtt"] = ... 

    def _ping(self, host: str) -> bool:
        """Ping a host to check connectivity."""
        try:
            subprocess.check_call(
                ["ping", "-c", "1", "-W", "1", host],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            return True
        except subprocess.CalledProcessError:
            return False

    def _get_default_gateway(self) -> Optional[str]:
        """Get default gateway IP."""
        try:
            result = subprocess.check_output(["ip", "route", "show", "default"])
            parts = result.decode().split()
            if "via" in parts:
                return parts[parts.index("via") + 1]
        except Exception:
            pass
        return None

    async def _buffer_data(self):
        """Write current tag values to database."""
        try:
            data = await self.store.get_all_tags(history_limit=0)
            timestamp = time.time()
            rows = []
            for tag_id, tag_val in data.items():
                if tag_val.value is not None:
                    rows.append((timestamp, tag_id, str(tag_val.value), tag_val.quality))
            
            if rows:
                self._write_batch(rows)
        except Exception as e:
            logger.error(f"Failed to buffer data: {e}")

    def _write_batch(self, rows: List[tuple]):
        """Write a batch of rows to SQLite."""
        try:
            conn = sqlite3.connect(BUFFER_DB_PATH)
            cursor = conn.cursor()
            cursor.executemany(
                'INSERT INTO buffered_data (timestamp, tag_id, value, quality) VALUES (?, ?, ?, ?)',
                rows
            )
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"DB Write Error: {e}")

    async def _handle_outage_end(self):
        """Handle end of buffering period: Export to CSV and create Outage record."""
        if not self.current_outage_start:
            return

        try:
            from app.core.database import SessionLocal
            db = SessionLocal()
            
            start_time = self.current_outage_start
            end_time = time.time()
            
            # Generate filename
            timestamp_str = datetime.fromtimestamp(start_time).strftime("%Y%m%d_%H%M%S")
            filename = f"outage_{timestamp_str}.csv"
            filepath = BUFFER_FILES_DIR / filename
            
            # Query data for this period
            data = self.query_data(start_time=start_time, end_time=end_time, limit=1000000)
            
            if not data:
                db.close()
                return

            # Write CSV
            with open(filepath, 'w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=["timestamp", "tag_id", "value", "quality"])
                writer.writeheader()
                for row in data:
                    row["timestamp"] = datetime.fromtimestamp(row["timestamp"]).isoformat()
                    writer.writerow(row)
            
            # Create Outage record
            outage = Outage(
                start_time=datetime.fromtimestamp(start_time),
                end_time=datetime.fromtimestamp(end_time),
                is_active=False,
                csv_filename=filename,
                total_records=len(data)
            )
            db.add(outage)
            db.commit()
            db.close()
            
            logger.info(f"Outage ended. Data exported to {filename}")
            
        except Exception as e:
            logger.error(f"Failed to handle outage end: {e}")

    # API Methods
    def get_status(self) -> Dict:
        return {
            "active": self.buffering_active,
            "triggers": self.triggers,
            "config": self.config
        }

    def update_config(self, config: Dict):
        self.config.update(config)

    def set_manual_trigger(self, active: bool):
        self.triggers["manual"] = active

    def query_data(self, tag_id: Optional[str] = None, start_time: Optional[float] = None, end_time: Optional[float] = None, limit: int = 1000) -> List[Dict]:
        try:
            conn = sqlite3.connect(BUFFER_DB_PATH)
            cursor = conn.cursor()
            
            query = "SELECT timestamp, tag_id, value, quality FROM buffered_data WHERE 1=1"
            params = []
            
            if tag_id:
                query += " AND tag_id = ?"
                params.append(tag_id)
            if start_time:
                query += " AND timestamp >= ?"
                params.append(start_time)
            if end_time:
                query += " AND timestamp <= ?"
                params.append(end_time)
                
            query += " ORDER BY timestamp ASC LIMIT ?"
            params.append(limit)
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            conn.close()
            
            return [
                {"timestamp": r[0], "tag_id": r[1], "value": r[2], "quality": r[3]}
                for r in rows
            ]
        except Exception as e:
            logger.error(f"Query Error: {e}")
            return []

    def clear_data(self):
        """Clear all buffered data."""
        try:
            conn = sqlite3.connect(BUFFER_DB_PATH)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM buffered_data")
            conn.commit()
            cursor.execute("VACUUM")
            conn.close()
            logger.info("Buffered data cleared")
            return True
        except Exception as e:
            logger.error(f"Failed to clear data: {e}")
            return False

    def get_buffered_tags(self) -> List[str]:
        """Get list of unique tag IDs that have buffered data."""
        try:
            conn = sqlite3.connect(BUFFER_DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT tag_id FROM buffered_data ORDER BY tag_id")
            rows = cursor.fetchall()
            conn.close()
            return [row[0] for row in rows]
        except Exception as e:
            logger.error(f"Failed to get buffered tags: {e}")
            return []

    # File Management Methods for Storage Policy
    def get_buffered_files(self, db: Session) -> List[Dict]:
        """Get list of buffered files from Outage records."""
        outages = db.query(Outage).filter(Outage.csv_filename.isnot(None)).order_by(Outage.start_time.desc()).all()
        files = []
        for outage in outages:
            filepath = BUFFER_FILES_DIR / outage.csv_filename
            size = filepath.stat().st_size if filepath.exists() else 0
            
            files.append({
                "outage_id": outage.id,
                "filename": outage.csv_filename,
                "label": outage.get_label(),
                "start_time": outage.start_time.isoformat(),
                "end_time": outage.end_time.isoformat() if outage.end_time else None,
                "is_active": outage.is_active,
                "record_count": outage.total_records,
                "size": size,
                "size_mb": round(size / (1024 * 1024), 2)
            })
        return files

    def get_file_path(self, filename: str) -> Optional[Path]:
        """Get absolute path for a buffered file."""
        # Security check: filename should be simple
        if ".." in filename or "/" in filename:
            return None
        
        filepath = BUFFER_FILES_DIR / filename
        if filepath.exists():
            return filepath
        return None

    async def cleanup_old_files(self, db: Session, max_age_days: int):
        """Cleanup files older than max_age_days."""
        # Implementation for cleanup logic...
        pass

buffering_service = BufferingService()

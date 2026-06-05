"""
DataStore Service
=================
Background async task that periodically reads the GlobalDataStore
and persists IO tag values to the DataStoreRecord table.

The service respects:
* DataStoreConfig.enabled  — master on/off switch
* DataStoreConfig.included_tags — if non-empty, only those tag_ids are stored
* DataStoreConfig.sample_interval — seconds between samples
"""

import asyncio
import logging
import time
import csv
import io
from typing import List, Optional

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.store import GlobalDataStore
from app.models.datastore import DataStoreConfig, DataStoreRecord
from app.models.models import Tag

logger = logging.getLogger(__name__)


class DataStoreService:
    _instance: Optional["DataStoreService"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._running = False
            cls._instance._reload_config = asyncio.Event()
        return cls._instance

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self):
        if self._running:
            return
        self._running = True
        asyncio.create_task(self._loop())
        logger.info("DataStoreService started.")

    async def stop(self):
        self._running = False
        logger.info("DataStoreService stopped.")

    def signal_config_reload(self):
        """Call this after updating DataStoreConfig so the loop picks it up immediately."""
        self._reload_config.set()

    # ------------------------------------------------------------------
    # Configuration helpers
    # ------------------------------------------------------------------

    def _load_config(self, db: Session) -> DataStoreConfig:
        cfg = db.query(DataStoreConfig).filter(DataStoreConfig.id == 1).first()
        if cfg is None:
            cfg = DataStoreConfig(id=1, enabled=False, included_tags=[], sample_interval=1)
            db.add(cfg)
            db.commit()
            db.refresh(cfg)
        return cfg

    def _get_io_tag_ids(self, db: Session) -> List[str]:
        tags = db.query(Tag).filter(Tag.type == "IO", Tag.enabled == True).all()
        return [t.tag_id for t in tags]

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _loop(self):
        last_config_load = 0.0
        cfg = None
        all_io_ids = []
        interval = 1
        enabled = False
        included = []

        while self._running:
            try:
                now = time.time()
                # Reload config every 5 seconds
                if now - last_config_load > 5.0 or cfg is None:
                    db = SessionLocal()
                    try:
                        cfg_db = self._load_config(db)
                        interval = max(1, cfg_db.sample_interval)
                        enabled = cfg_db.enabled
                        included = list(cfg_db.included_tags or [])
                        all_io_ids = self._get_io_tag_ids(db)
                        cfg = {
                            "enabled": enabled,
                            "sample_interval": interval,
                            "included_tags": included
                        }
                    finally:
                        db.close()
                    last_config_load = now

                if not enabled:
                    # Sleep 5 s between checks while disabled
                    try:
                        await asyncio.wait_for(self._reload_config.wait(), timeout=5)
                        self._reload_config.clear()
                    except asyncio.TimeoutError:
                        pass
                    continue

                # Determine which tags to record
                target_ids = included if included else all_io_ids

                # Read current values from the in-memory store
                store = GlobalDataStore()
                all_values = await GlobalDataStore.get_all_tags(history_limit=0)

                records_to_write = []
                ts = time.time()
                for tag_id in target_ids:
                    tag_val = all_values.get(tag_id)
                    if tag_val is not None:
                        records_to_write.append(DataStoreRecord(
                            tag_id=tag_id,
                            value=str(tag_val.value) if tag_val.value is not None else None,
                            quality=tag_val.quality,
                            timestamp=ts,
                        ))

                if records_to_write:
                    db = SessionLocal()
                    try:
                        db.bulk_save_objects(records_to_write)
                        db.commit()
                    except Exception as exc:
                        db.rollback()
                        logger.error(f"DataStoreService: failed to write records: {exc}")
                    finally:
                        db.close()

            except Exception as exc:
                logger.error(f"DataStoreService loop error: {exc}")

            # Wait for interval or early config reload signal
            try:
                await asyncio.wait_for(self._reload_config.wait(), timeout=interval)
                self._reload_config.clear()
            except asyncio.TimeoutError:
                pass

    # ------------------------------------------------------------------
    # Query helpers (called by the API layer)
    # ------------------------------------------------------------------

    def get_records(
        self,
        db: Session,
        tag_ids: Optional[List[str]] = None,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        limit: int = 5000,
    ) -> List[DataStoreRecord]:
        q = db.query(DataStoreRecord)
        if tag_ids:
            q = q.filter(DataStoreRecord.tag_id.in_(tag_ids))
        if start_time is not None:
            q = q.filter(DataStoreRecord.timestamp >= start_time)
        if end_time is not None:
            q = q.filter(DataStoreRecord.timestamp <= end_time)
        q = q.order_by(DataStoreRecord.timestamp.desc()).limit(limit)
        return q.all()

    def get_distinct_tags(self, db: Session) -> List[str]:
        rows = db.query(DataStoreRecord.tag_id).distinct().all()
        return [r[0] for r in rows]

    def get_stats(self, db: Session) -> dict:
        from sqlalchemy import func
        total_rows = db.query(func.count(DataStoreRecord.id)).scalar() or 0
        tag_count = db.query(func.count(DataStoreRecord.tag_id.distinct())).scalar() or 0
        oldest = db.query(func.min(DataStoreRecord.timestamp)).scalar()
        newest = db.query(func.max(DataStoreRecord.timestamp)).scalar()
        return {
            "total_rows": total_rows,
            "tag_count": tag_count,
            "oldest_timestamp": oldest,
            "newest_timestamp": newest,
        }

    def delete_records(
        self,
        db: Session,
        tag_ids: Optional[List[str]] = None,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
    ) -> int:
        q = db.query(DataStoreRecord)
        if tag_ids:
            q = q.filter(DataStoreRecord.tag_id.in_(tag_ids))
        if start_time is not None:
            q = q.filter(DataStoreRecord.timestamp >= start_time)
        if end_time is not None:
            q = q.filter(DataStoreRecord.timestamp <= end_time)
        deleted = q.delete(synchronize_session=False)
        db.commit()
        return deleted

    def export_csv(
        self,
        db: Session,
        tag_ids: Optional[List[str]] = None,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        limit: int = 100000,
    ) -> str:
        records = self.get_records(db, tag_ids, start_time, end_time, limit)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["timestamp_iso", "timestamp_epoch", "tag_id", "value", "quality"])
        from datetime import datetime, timezone
        for r in reversed(records):  # chronological order
            dt = datetime.fromtimestamp(r.timestamp, tz=timezone.utc).isoformat()
            writer.writerow([dt, r.timestamp, r.tag_id, r.value, r.quality])
        return output.getvalue()


# Singleton instance used by the startup event and endpoint router
datastore_service = DataStoreService()

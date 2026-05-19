from sqlalchemy import Column, Integer, String, Boolean, Float, JSON, Index
from app.core.database import Base


class DataStoreConfig(Base):
    """
    Singleton configuration row for the DataStore feature.
    There is always exactly one row (id=1).
    """
    __tablename__ = "datastore_config"

    id = Column(Integer, primary_key=True, default=1)
    enabled = Column(Boolean, default=False)
    # JSON list of tag_ids to record. Empty list = record ALL IO tags.
    included_tags = Column(JSON, default=[])
    # Sampling interval in seconds (1 = every second, 5 = every 5 seconds, etc.)
    sample_interval = Column(Integer, default=1)


class DataStoreRecord(Base):
    """
    One row per sampled value.  Indexed on (tag_id, timestamp) for fast range queries.
    """
    __tablename__ = "datastore_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tag_id = Column(String, nullable=False, index=True)
    value = Column(String, nullable=True)   # stored as string; cast on read
    quality = Column(String, default="GOOD")
    timestamp = Column(Float, nullable=False, index=True)  # unix epoch (seconds)

    __table_args__ = (
        Index("idx_datastore_tag_ts", "tag_id", "timestamp"),
    )

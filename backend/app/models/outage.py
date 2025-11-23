"""
Outage tracking model for data buffering system.

This model tracks network outages and associates them with CSV files
containing buffered data that couldn't be sent to northbound servers.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from datetime import datetime

from ..core.database import Base


class Outage(Base):
    """
    Represents a network outage period during which data was buffered locally.
    
    Attributes:
        id: Primary key
        start_time: When the outage started
        end_time: When the outage ended (None if still active)
        is_active: Whether this outage is currently ongoing
        gateway_ip: IP address of the gateway that was unreachable
        csv_filename: Name of the CSV file containing buffered data
        total_records: Number of records written to the CSV file
        created_at: Timestamp when this record was created
    """
    __tablename__ = "outages"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    start_time = Column(DateTime, nullable=False, default=func.now())
    end_time = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    gateway_ip = Column(String(45), nullable=True)  # IPv4 or IPv6
    csv_filename = Column(String(255), nullable=True)
    total_records = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    
    def __repr__(self):
        status = "ACTIVE" if self.is_active else "ENDED"
        return f"<Outage(id={self.id}, status={status}, records={self.total_records})>"
    
    def get_duration_seconds(self) -> int:
        """Calculate outage duration in seconds."""
        end = self.end_time if self.end_time else datetime.utcnow()
        return int((end - self.start_time).total_seconds())
    
    def get_label(self) -> str:
        """Generate a human-readable label for this outage."""
        start_str = self.start_time.strftime("%Y-%m-%d %H:%M:%S")
        if self.end_time:
            end_str = self.end_time.strftime("%Y-%m-%d %H:%M:%S")
            duration = self.get_duration_seconds()
            hours = duration // 3600
            minutes = (duration % 3600) // 60
            return f"Outage from {start_str} to {end_str} ({hours}h {minutes}m, {self.total_records} records)"
        else:
            return f"Ongoing outage since {start_str} ({self.total_records} records)"

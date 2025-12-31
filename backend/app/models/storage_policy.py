from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from datetime import datetime
import enum

from ..core.database import Base


class PolicyType(str, enum.Enum):
    STORAGE = "storage"
    TIME = "time"


class TimeUnit(str, enum.Enum):
    DAYS = "days"
    WEEKS = "weeks"
    MONTHS = "months"


class StoragePolicy(Base):
    __tablename__ = "storage_policy"

    id = Column(Integer, primary_key=True, index=True)
    enabled = Column(Boolean, default=False, nullable=False)
    policy_type = Column(Enum(PolicyType), nullable=True)
    storage_threshold_percent = Column(Integer, nullable=True)
    time_value = Column(Integer, nullable=True)
    time_unit = Column(Enum(TimeUnit), nullable=True)
    northbound_interface = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Auto-Cleanup Settings
    auto_cleanup_enabled = Column(Boolean, default=False)
    cleanup_threshold = Column(Integer, default=85)  # % usage to trigger cleanup
    cleanup_schedule = Column(String, default="daily")  # 'daily', 'weekly'

    def is_storage_based(self) -> bool:
        """Check if policy is storage-based"""
        return self.policy_type == PolicyType.STORAGE

    def is_time_based(self) -> bool:
        """Check if policy is time-based"""
        return self.policy_type == PolicyType.TIME

    def get_time_in_days(self) -> int:
        """Convert time value to days"""
        if not self.time_value or not self.time_unit:
            return 0
        
        if self.time_unit == TimeUnit.DAYS:
            return self.time_value
        elif self.time_unit == TimeUnit.WEEKS:
            return self.time_value * 7
        elif self.time_unit == TimeUnit.MONTHS:
            return self.time_value * 30
        return 0

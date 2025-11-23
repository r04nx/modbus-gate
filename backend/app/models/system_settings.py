from sqlalchemy import Column, String, DateTime
from datetime import datetime

from ..core.database import Base


class SystemSettings(Base):
    __tablename__ = "system_settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @staticmethod
    def get_default_settings():
        """Return default system settings"""
        return {
            "hostname": "vistaiot-gateway",
            "ssh_enabled": "false",
            "auto_update_enabled": "false",
            "auto_update_branch": "production",
            "update_repo_url": "https://github.com/yourusername/modbus-gate",
            "last_update_check": "",
            "last_update_status": "",
        }

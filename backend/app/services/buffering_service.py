"""
Data Buffering Service

Handles local CSV-based data buffering when the gateway cannot reach
northbound servers. Tracks outages and logs all tag data with timestamps.
"""

import os
import csv
import asyncio
import subprocess
from datetime import datetime
from typing import List, Dict, Optional
from pathlib import Path
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.outage import Outage


class BufferingService:
    """
    Service for buffering data locally when northbound communication fails.
    
    This service:
    - Monitors gateway connectivity
    - Creates CSV files for outage periods
    - Logs all tag data with timestamps
    - Manages file cleanup based on storage policy
    """
    
    def __init__(self, buffer_dir: str = "backend/buffered_data"):
        """
        Initialize the buffering service.
        
        Args:
            buffer_dir: Directory to store buffered CSV files
        """
        self.buffer_dir = Path(buffer_dir)
        self.current_outage_id: Optional[int] = None
        self.csv_file = None
        self.csv_writer = None
        self.gateway_ip: Optional[str] = None
        self.record_count = 0
        
        # Create buffer directory if it doesn't exist
        self.buffer_dir.mkdir(parents=True, exist_ok=True)
        
        # CSV column headers
        self.csv_headers = [
            "timestamp",
            "tag_id",
            "tag_name",
            "value",
            "data_type",
            "quality",
            "poll_cycle",
            "source_device"
        ]
    
    async def check_gateway_connectivity(self) -> bool:
        """
        Check if the default gateway is reachable.
        
        Returns:
            True if gateway is reachable, False otherwise
        """
        try:
            # Get default gateway IP
            if not self.gateway_ip:
                self.gateway_ip = await self._get_default_gateway()
            
            if not self.gateway_ip:
                return False
            
            # Ping the gateway (1 packet, 1 second timeout)
            result = subprocess.run(
                ["ping", "-c", "1", "-W", "1", self.gateway_ip],
                capture_output=True,
                timeout=2
            )
            
            return result.returncode == 0
            
        except Exception as e:
            print(f"Error checking gateway connectivity: {e}")
            return False
    
    async def _get_default_gateway(self) -> Optional[str]:
        """
        Get the default gateway IP address.
        
        Returns:
            Gateway IP address or None if not found
        """
        try:
            result = subprocess.run(
                ["ip", "route", "show", "default"],
                capture_output=True,
                text=True,
                timeout=2
            )
            
            if result.returncode == 0:
                # Parse output: "default via 192.168.1.1 dev eth0"
                parts = result.stdout.split()
                if len(parts) >= 3 and parts[0] == "default" and parts[1] == "via":
                    return parts[2]
            
            return None
            
        except Exception as e:
            print(f"Error getting default gateway: {e}")
            return None
    
    async def start_outage(self, db: Session) -> int:
        """
        Start a new outage period and create CSV file.
        
        Args:
            db: Database session
            
        Returns:
            Outage ID
        """
        # Create outage record
        outage = Outage(
            start_time=datetime.utcnow(),
            is_active=True,
            gateway_ip=self.gateway_ip
        )
        
        db.add(outage)
        db.commit()
        db.refresh(outage)
        
        self.current_outage_id = outage.id
        self.record_count = 0
        
        # Create CSV file with temporary name
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"outage_{timestamp}_to_active.csv"
        filepath = self.buffer_dir / filename
        
        # Update outage with filename
        outage.csv_filename = filename
        db.commit()
        
        # Open CSV file for writing
        self.csv_file = open(filepath, 'w', newline='')
        self.csv_writer = csv.DictWriter(self.csv_file, fieldnames=self.csv_headers)
        self.csv_writer.writeheader()
        self.csv_file.flush()
        
        print(f"Started outage {outage.id}, logging to {filename}")
        
        return outage.id
    
    async def log_data_to_csv(self, tags_data: List[Dict], db: Session):
        """
        Log tag data to the current outage CSV file.
        
        Args:
            tags_data: List of tag data dictionaries
            db: Database session
        """
        if not self.csv_writer or not self.current_outage_id:
            return
        
        for tag_data in tags_data:
            row = {
                "timestamp": tag_data.get("timestamp", datetime.utcnow().isoformat()),
                "tag_id": tag_data.get("tag_id", ""),
                "tag_name": tag_data.get("tag_name", ""),
                "value": tag_data.get("value", ""),
                "data_type": tag_data.get("data_type", ""),
                "quality": tag_data.get("quality", "GOOD"),
                "poll_cycle": tag_data.get("poll_cycle", ""),
                "source_device": tag_data.get("source_device", "")
            }
            
            self.csv_writer.writerow(row)
            self.record_count += 1
        
        # Flush to disk
        self.csv_file.flush()
        
        # Update record count in database
        outage = db.query(Outage).filter(Outage.id == self.current_outage_id).first()
        if outage:
            outage.total_records = self.record_count
            db.commit()
    
    async def end_outage(self, db: Session):
        """
        End the current outage period and finalize CSV file.
        
        Args:
            db: Database session
        """
        if not self.current_outage_id:
            return
        
        # Get outage record
        outage = db.query(Outage).filter(Outage.id == self.current_outage_id).first()
        if not outage:
            return
        
        # Close CSV file
        if self.csv_file:
            self.csv_file.close()
            self.csv_file = None
            self.csv_writer = None
        
        # Update outage record
        outage.end_time = datetime.utcnow()
        outage.is_active = False
        outage.total_records = self.record_count
        
        # Rename CSV file with end time
        if outage.csv_filename:
            old_path = self.buffer_dir / outage.csv_filename
            start_str = outage.start_time.strftime("%Y%m%d_%H%M%S")
            end_str = outage.end_time.strftime("%Y%m%d_%H%M%S")
            new_filename = f"outage_{start_str}_to_{end_str}.csv"
            new_path = self.buffer_dir / new_filename
            
            if old_path.exists():
                old_path.rename(new_path)
                outage.csv_filename = new_filename
        
        db.commit()
        
        print(f"Ended outage {outage.id}, total records: {self.record_count}")
        
        # Reset state
        self.current_outage_id = None
        self.record_count = 0
    
    async def log_poll_data(self, tags_data: List[Dict], db: Session):
        """
        Main entry point for logging poll data.
        Checks connectivity and logs data if gateway is unreachable.
        
        Args:
            tags_data: List of tag data dictionaries
            db: Database session
        """
        is_connected = await self.check_gateway_connectivity()
        
        if not is_connected:
            # Gateway unreachable - buffer data
            if not self.current_outage_id:
                await self.start_outage(db)
            await self.log_data_to_csv(tags_data, db)
        else:
            # Gateway reachable - end outage if active
            if self.current_outage_id:
                await self.end_outage(db)
    
    def get_buffered_files(self, db: Session) -> List[Dict]:
        """
        Get list of all buffered CSV files.
        
        Args:
            db: Database session
            
        Returns:
            List of file information dictionaries
        """
        outages = db.query(Outage).order_by(Outage.start_time.desc()).all()
        
        files = []
        for outage in outages:
            if outage.csv_filename:
                filepath = self.buffer_dir / outage.csv_filename
                if filepath.exists():
                    files.append({
                        "outage_id": outage.id,
                        "filename": outage.csv_filename,
                        "label": outage.get_label(),
                        "start_time": outage.start_time.isoformat(),
                        "end_time": outage.end_time.isoformat() if outage.end_time else None,
                        "is_active": outage.is_active,
                        "record_count": outage.total_records,
                        "size": filepath.stat().st_size,
                        "size_mb": round(filepath.stat().st_size / (1024 * 1024), 2)
                    })
        
        return files
    
    def get_file_path(self, filename: str) -> Optional[Path]:
        """
        Get the full path to a buffered file.
        
        Args:
            filename: Name of the CSV file
            
        Returns:
            Path object or None if file doesn't exist
        """
        filepath = self.buffer_dir / filename
        if filepath.exists() and filepath.parent == self.buffer_dir:
            return filepath
        return None
    
    async def cleanup_old_files(self, db: Session, max_age_days: int = 30):
        """
        Remove buffered files older than specified age.
        
        Args:
            db: Database session
            max_age_days: Maximum age of files to keep
        """
        from datetime import timedelta
        
        cutoff_date = datetime.utcnow() - timedelta(days=max_age_days)
        
        old_outages = db.query(Outage).filter(
            Outage.start_time < cutoff_date,
            Outage.is_active == False
        ).all()
        
        for outage in old_outages:
            if outage.csv_filename:
                filepath = self.buffer_dir / outage.csv_filename
                if filepath.exists():
                    filepath.unlink()
            
            db.delete(outage)
        
        db.commit()


# Global buffering service instance
buffering_service = BufferingService()

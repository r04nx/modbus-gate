"""
Database migration script to add outages table for data buffering.

This script creates the outages table for tracking network outages
and their associated CSV files.

Run this script to update the database schema:
    python migrate_buffering.py
"""

import sqlite3
from datetime import datetime

# Database path
DB_PATH = "backend/vistaiot.db"


def migrate():
    """Add outages table to the database."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Create outages table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS outages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                start_time TIMESTAMP NOT NULL,
                end_time TIMESTAMP,
                is_active BOOLEAN DEFAULT 1 NOT NULL,
                gateway_ip TEXT,
                csv_filename TEXT,
                total_records INTEGER DEFAULT 0 NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
            )
        """)
        
        conn.commit()
        print("✓ Created outages table")
        
        # Create buffer data directory (use local path for development)
        import os
        buffer_dir = "backend/buffered_data"
        os.makedirs(buffer_dir, exist_ok=True)
        print(f"✓ Created buffer directory: {buffer_dir}")
        
        print("\n✅ Migration completed successfully!")
        
    except Exception as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        raise
    
    finally:
        conn.close()


if __name__ == "__main__":
    print("=" * 60)
    print("Data Buffering Migration")
    print("=" * 60)
    print()
    
    migrate()

"""
Database migration script to create settings-related tables.

This script creates:
- users table (for authentication)
- sessions table (for session management)
- storage_policy table (for data buffering configuration)
- system_settings table (for system configuration)

It also initializes default data:
- Default superroot user (username: admin, password: admin)
- Default storage policy (disabled)
- Default system settings
"""

import sys
import os
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
from app.core.database import Base, SQLALCHEMY_DATABASE_URL
from app.models.user import User, Session, UserRole
from app.models.storage_policy import StoragePolicy, PolicyType, TimeUnit
from app.models.system_settings import SystemSettings
from app.models.models import Device, Tag, ServerConfig


def create_tables(engine):
    """Create all tables"""
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    print("✓ Tables created successfully")


def initialize_default_user(db_session):
    """Create default superroot user"""
    print("\nInitializing default user...")
    
    # Check if any users exist
    existing_user = db_session.query(User).first()
    if existing_user:
        print("✓ Users already exist, skipping default user creation")
        return
    
    # Create default superroot user
    default_user = User(
        username="admin",
        role=UserRole.SUPERROOT
    )
    default_user.set_password("admin")
    
    db_session.add(default_user)
    db_session.commit()
    
    print("✓ Default superroot user created:")
    print(f"  Username: admin")
    print(f"  Password: admin")
    print(f"  Role: {UserRole.SUPERROOT}")
    print("\n⚠️  IMPORTANT: Change the default password after first login!")


def initialize_storage_policy(db_session):
    """Create default storage policy"""
    print("\nInitializing storage policy...")
    
    # Check if policy exists
    existing_policy = db_session.query(StoragePolicy).first()
    if existing_policy:
        print("✓ Storage policy already exists, skipping")
        return
    
    # Create default policy (disabled)
    default_policy = StoragePolicy(
        enabled=False,
        policy_type=PolicyType.STORAGE,
        storage_threshold_percent=80,
        time_value=7,
        time_unit=TimeUnit.DAYS,
        northbound_interface="MQTT"
    )
    
    db_session.add(default_policy)
    db_session.commit()
    
    print("✓ Default storage policy created (disabled)")


def initialize_system_settings(db_session):
    """Create default system settings"""
    print("\nInitializing system settings...")
    
    # Check if settings exist
    existing_settings = db_session.query(SystemSettings).first()
    if existing_settings:
        print("✓ System settings already exist, skipping")
        return
    
    # Create default settings
    default_settings = SystemSettings.get_default_settings()
    
    for key, value in default_settings.items():
        setting = SystemSettings(key=key, value=value)
        db_session.add(setting)
    
    db_session.commit()
    
    print("✓ Default system settings created:")
    for key, value in default_settings.items():
        print(f"  {key}: {value}")


def verify_tables(engine):
    """Verify that all tables were created"""
    print("\nVerifying tables...")
    
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    
    required_tables = [
        "users",
        "sessions",
        "storage_policy",
        "system_settings",
        "devices",
        "tags",
        "server_configs"
    ]
    
    missing_tables = [table for table in required_tables if table not in tables]
    
    if missing_tables:
        print(f"✗ Missing tables: {', '.join(missing_tables)}")
        return False
    
    print("✓ All required tables exist:")
    for table in required_tables:
        print(f"  - {table}")
    
    return True


def main():
    """Main migration function"""
    print("=" * 60)
    print("Settings Database Migration")
    print("=" * 60)
    
    # Ensure we're in the correct directory
    script_dir = Path(__file__).parent
    os.chdir(script_dir)
    
    print(f"\nDatabase URL: {SQLALCHEMY_DATABASE_URL}")
    print(f"Working directory: {os.getcwd()}")
    
    # Create engine and session
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db_session = SessionLocal()
    
    try:
        # Create tables
        create_tables(engine)
        
        # Verify tables
        if not verify_tables(engine):
            print("\n✗ Migration failed: Not all tables were created")
            return 1
        
        # Initialize default data
        initialize_default_user(db_session)
        initialize_storage_policy(db_session)
        initialize_system_settings(db_session)
        
        print("\n" + "=" * 60)
        print("✓ Migration completed successfully!")
        print("=" * 60)
        
        return 0
        
    except Exception as e:
        print(f"\n✗ Migration failed with error: {e}")
        import traceback
        traceback.print_exc()
        db_session.rollback()
        return 1
        
    finally:
        db_session.close()


if __name__ == "__main__":
    exit(main())

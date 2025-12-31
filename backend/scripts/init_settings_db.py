#!/usr/bin/env python3
"""
Database initialization script for Settings page
Creates default admin user and initializes system settings
"""
import sys
from sqlalchemy.orm import Session
from app.core.database import engine, SessionLocal
from app.models.user import User, UserRole
from app.models.storage_policy import StoragePolicy, PolicyType, TimeUnit
from app.models.system_settings import SystemSettings

def init_database():
    """Initialize database with default data"""
    # Create tables
    from app.core.database import Base
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    try:
        # Check if admin user already exists
        admin_user = db.query(User).filter(User.username == "admin").first()
        
        if not admin_user:
            print("Creating default admin user...")
            admin_user = User(
                username="admin",
                role=UserRole.SUPERROOT
            )
            admin_user.set_password("admin")
            db.add(admin_user)
            print("✓ Admin user created (username: admin, password: admin)")
        else:
            print("✓ Admin user already exists")
        
        # Check if storage policy exists
        storage_policy = db.query(StoragePolicy).first()
        
        if not storage_policy:
            print("Creating default storage policy...")
            storage_policy = StoragePolicy(
                enabled=False,
                policy_type=PolicyType.TIME,
                storage_threshold_percent=80,
                time_value=7,
                time_unit=TimeUnit.DAYS,
                northbound_interface=None
            )
            db.add(storage_policy)
            print("✓ Storage policy created")
        else:
            print("✓ Storage policy already exists")
        
        # Check if system settings exist
        existing_settings = db.query(SystemSettings).count()
        
        if existing_settings == 0:
            print("Creating default system settings...")
            default_settings = SystemSettings.get_default_settings()
            for key, value in default_settings.items():
                setting = SystemSettings(key=key, value=value)
                db.add(setting)
            print("✓ System settings created")
        else:
            print("✓ System settings already exist")
        
        db.commit()
        print("\n✅ Database initialization completed successfully!")
        return True
        
    except Exception as e:
        print(f"\n❌ Error initializing database: {e}")
        db.rollback()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 50)
    print("VistaIOT Settings Database Initialization")
    print("=" * 50)
    print()
    
    success = init_database()
    sys.exit(0 if success else 1)

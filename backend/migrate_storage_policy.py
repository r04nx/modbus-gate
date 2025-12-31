from sqlalchemy import create_engine, text
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database URL
SQLALCHEMY_DATABASE_URL = "sqlite:///./vistaiot.db"

def migrate():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    with engine.connect() as conn:
        logger.info("Starting Storage Policy migration...")
        
        # Check existing columns
        result = conn.execute(text("PRAGMA table_info(storage_policy)"))
        columns = [row[1] for row in result.fetchall()]
        
        # Add auto_cleanup_enabled
        if 'auto_cleanup_enabled' not in columns:
            logger.info("Adding auto_cleanup_enabled column...")
            conn.execute(text("ALTER TABLE storage_policy ADD COLUMN auto_cleanup_enabled BOOLEAN DEFAULT 0"))
            
        # Add cleanup_threshold
        if 'cleanup_threshold' not in columns:
            logger.info("Adding cleanup_threshold column...")
            conn.execute(text("ALTER TABLE storage_policy ADD COLUMN cleanup_threshold INTEGER DEFAULT 85"))
            
        # Add cleanup_schedule
        if 'cleanup_schedule' not in columns:
            logger.info("Adding cleanup_schedule column...")
            conn.execute(text("ALTER TABLE storage_policy ADD COLUMN cleanup_schedule VARCHAR DEFAULT 'daily'"))
            
        logger.info("Migration completed successfully!")

if __name__ == "__main__":
    migrate()

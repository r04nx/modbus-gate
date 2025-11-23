"""
Database Migration: Add Fallback Mechanism to Tags

This migration adds fallback support to tags for handling connectivity issues.

New columns:
- fallback_type: 'last_success' or 'default'
- fallback_value: Default value when fallback_type is 'default'
- last_success_value: Last successfully polled value

Usage:
    python migrate_fallback.py
"""

import sqlite3
import os
from pathlib import Path

# Database path
DB_PATH = Path(__file__).parent / "backend" / "vistaiot.db"


def migrate():
    """Add fallback mechanism columns to tags table"""
    
    print("=" * 60)
    print("Database Migration: Add Fallback Mechanism")
    print("=" * 60)
    
    if not DB_PATH.exists():
        print(f"❌ Database not found at: {DB_PATH}")
        print("   Please run the application first to create the database.")
        return False
    
    print(f"📁 Database: {DB_PATH}")
    
    try:
        # Connect to database
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(tags)")
        columns = [column[1] for column in cursor.fetchall()]
        
        migrations_needed = []
        
        if 'fallback_type' not in columns:
            migrations_needed.append('fallback_type')
        
        if 'fallback_value' not in columns:
            migrations_needed.append('fallback_value')
        
        if 'last_success_value' not in columns:
            migrations_needed.append('last_success_value')
        
        if not migrations_needed:
            print("✅ All fallback columns already exist. No migration needed.")
            conn.close()
            return True
        
        print(f"\n📝 Adding columns: {', '.join(migrations_needed)}")
        
        # Add fallback_type column
        if 'fallback_type' in migrations_needed:
            print("   Adding fallback_type column...")
            cursor.execute("""
                ALTER TABLE tags 
                ADD COLUMN fallback_type TEXT DEFAULT 'last_success'
            """)
            print("   ✓ fallback_type added")
        
        # Add fallback_value column
        if 'fallback_value' in migrations_needed:
            print("   Adding fallback_value column...")
            cursor.execute("""
                ALTER TABLE tags 
                ADD COLUMN fallback_value TEXT
            """)
            print("   ✓ fallback_value added")
        
        # Add last_success_value column
        if 'last_success_value' in migrations_needed:
            print("   Adding last_success_value column...")
            cursor.execute("""
                ALTER TABLE tags 
                ADD COLUMN last_success_value TEXT
            """)
            print("   ✓ last_success_value added")
        
        # Commit changes
        conn.commit()
        
        # Verify migration
        cursor.execute("PRAGMA table_info(tags)")
        columns_after = [column[1] for column in cursor.fetchall()]
        
        print("\n✅ Migration completed successfully!")
        print(f"\n📊 Tags table now has {len(columns_after)} columns:")
        for col in columns_after:
            if col in ['fallback_type', 'fallback_value', 'last_success_value']:
                print(f"   • {col} [NEW]")
            else:
                print(f"   • {col}")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        return False


def rollback():
    """Rollback migration (SQLite doesn't support DROP COLUMN easily)"""
    print("\n⚠️  SQLite doesn't support DROP COLUMN directly.")
    print("   To rollback, you would need to:")
    print("   1. Create a new table without the fallback columns")
    print("   2. Copy data from old table to new table")
    print("   3. Drop old table and rename new table")
    print("\n   This is not implemented in this script.")


if __name__ == "__main__":
    print("\n")
    success = migrate()
    
    if success:
        print("\n" + "=" * 60)
        print("Migration Summary")
        print("=" * 60)
        print("✅ Fallback mechanism columns added to tags table")
        print("\nNew features:")
        print("  • Tags can now use 'last_success' or 'default' fallback")
        print("  • Last successful value is stored automatically")
        print("  • Custom default values can be specified")
        print("\n💡 Next steps:")
        print("  1. Restart the backend server")
        print("  2. Update tags to configure fallback behavior")
        print("  3. Test with simulated connectivity failures")
        print("=" * 60)
    else:
        print("\n❌ Migration failed. Please check the errors above.")
    
    print("\n")

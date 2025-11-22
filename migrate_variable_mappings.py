"""
Database migration to add variable_mappings column to tags table
"""
import sqlite3

def migrate():
    conn = sqlite3.connect('backend/vistaiot.db')
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(tags)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'variable_mappings' not in columns:
            print("Adding variable_mappings column to tags table...")
            cursor.execute("""
                ALTER TABLE tags 
                ADD COLUMN variable_mappings TEXT
            """)
            conn.commit()
            print("✓ Successfully added variable_mappings column")
        else:
            print("✓ variable_mappings column already exists")
        
    except Exception as e:
        print(f"✗ Error during migration: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()

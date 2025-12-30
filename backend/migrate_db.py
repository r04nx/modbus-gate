import sqlite3

DB_PATH = "vistaiot.db"

def migrate():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        print(f"Connected to {DB_PATH}")
        
        # Check existing columns
        cursor.execute("PRAGMA table_info(tags)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'fallback_type' not in columns:
            print("Adding 'fallback_type' column...")
            cursor.execute("ALTER TABLE tags ADD COLUMN fallback_type VARCHAR DEFAULT 'last_success'")
        else:
            print("'fallback_type' column already exists.")

        if 'fallback_value' not in columns:
            print("Adding 'fallback_value' column...")
            cursor.execute("ALTER TABLE tags ADD COLUMN fallback_value VARCHAR DEFAULT NULL")
        else:
            print("'fallback_value' column already exists.")

        if 'last_success_value' not in columns:
            print("Adding 'last_success_value' column...")
            cursor.execute("ALTER TABLE tags ADD COLUMN last_success_value VARCHAR DEFAULT NULL")
        else:
            print("'last_success_value' column already exists.")
            
        conn.commit()
        print("Migration complete successfully.")
        
    except Exception as e:
        print(f"Error during migration: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    migrate()

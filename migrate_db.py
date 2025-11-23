import sqlite3

conn = sqlite3.connect('backend/vistaiot.db')
cursor = conn.cursor()

try:
    # Create server_configs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS server_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type VARCHAR,
        enabled BOOLEAN,
        config JSON
    )
    """)
    
    # Create index on type
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_server_configs_type ON server_configs (type)")
    
    conn.commit()
    print("Successfully created 'server_configs' table.")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()

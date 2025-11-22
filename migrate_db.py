import sqlite3

conn = sqlite3.connect('backend/vistaiot.db')
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE tags ADD COLUMN params JSON")
    conn.commit()
    print("Successfully added 'params' column to 'tags' table.")
except sqlite3.OperationalError as e:
    if "duplicate column name" in str(e):
        print("Column 'params' already exists.")
    else:
        print(f"Error: {e}")
finally:
    conn.close()

import sqlite3
import json

conn = sqlite3.connect('vistaiot.db')
cursor = conn.cursor()

print("--- Checking Devices Table ---")
cursor.execute("SELECT id, name, connection_params FROM devices")
rows = cursor.fetchall()

for row in rows:
    id, name, params = row
    print(f"ID: {id}, Name: {name}")
    print(f"Raw Params: {repr(params)}")
    try:
        if params:
            json.loads(params)
            print("Status: VALID JSON")
        else:
            print("Status: EMPTY/NULL")
    except json.JSONDecodeError as e:
        print(f"Status: INVALID JSON - {e}")
    print("-" * 20)

cursor.close()
conn.close()

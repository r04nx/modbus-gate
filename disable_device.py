import sqlite3

conn = sqlite3.connect('backend/vistaiot.db')
cursor = conn.cursor()

# Disable the failing Modbus device (id=1)
cursor.execute("UPDATE devices SET enabled = 0 WHERE id = 1")
conn.commit()

print(f"Disabled {cursor.rowcount} device(s).")
conn.close()

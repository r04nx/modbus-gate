import sqlite3

conn = sqlite3.connect('backend/vistaiot.db')
cursor = conn.cursor()

# Fix the invalid address
cursor.execute("UPDATE tags SET address = '1.3.6.1.2.1.1.1.0' WHERE address = 'localhost' AND type = 'IO'")
conn.commit()

print(f"Updated {cursor.rowcount} tags.")
conn.close()

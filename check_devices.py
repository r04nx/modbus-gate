import sqlite3
import pandas as pd

pd.set_option('display.max_columns', None)
pd.set_option('display.width', 1000)

conn = sqlite3.connect('backend/vistaiot.db')
df = pd.read_sql_query("SELECT id, name, type, connection_params, enabled FROM devices", conn)
print(df)
conn.close()

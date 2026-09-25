import sqlite3
import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

conn = sqlite3.connect('data/tienganh7.db')
cursor = conn.cursor()

cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
print(f"Total tables: {len(tables)}")
for name, sql in tables:
    count = cursor.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
    print(f"\n--- Table: {name} (Rows: {count}) ---")
    print(sql)
    cursor.execute(f"SELECT * FROM {name} LIMIT 2")
    samples = cursor.fetchall()
    print("Samples:", samples)

conn.close()

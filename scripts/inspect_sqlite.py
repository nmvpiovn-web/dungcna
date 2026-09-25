import sqlite3
import sys

sys.stdout.reconfigure(encoding='utf-8')
conn = sqlite3.connect('data/tienganh7.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row[0] for row in cursor.fetchall()]
print("Tables in data/tienganh7.db:", tables)
for t in tables:
    cursor.execute(f"PRAGMA table_info({t});")
    cols = [r[1] for r in cursor.fetchall()]
    cursor.execute(f"SELECT COUNT(*) FROM {t};")
    cnt = cursor.fetchone()[0]
    print(f"Table {t} ({cnt} rows): {cols}")

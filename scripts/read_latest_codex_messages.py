import sqlite3
import os
import json
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')
db_path = os.path.expanduser('~/.codex/thread_history_1.sqlite')

if not os.path.exists(db_path):
    print(f"Error: {db_path} does not exist")
    sys.exit(1)

conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute("""
    SELECT item_type, item_json, created_at_ms 
    FROM thread_items 
    WHERE thread_id = '01a0d8cb-e7f2-72e3-b105-e06c43009750' 
    ORDER BY created_at_ms DESC 
    LIMIT 20
""")
rows = c.fetchall()
rows.reverse()

print(f"=== LATEST MESSAGES FROM THREAD 01a0d8cb-e7f2-72e3-b105-e06c43009750 ({len(rows)} items) ===")
for r in rows:
    item_type = r[0]
    data = json.loads(r[1])
    ts = datetime.fromtimestamp(r[2] / 1000).strftime('%Y-%m-%d %H:%M:%S')
    
    if item_type == 'userMessage':
        txt = ''.join([item.get('text', '') for item in data.get('content', []) if item.get('type') == 'text'])
        print(f"\n[{ts}] 👤 USER:")
        print(txt)
    elif item_type == 'agentMessage':
        txt = data.get('text', '')
        print(f"\n[{ts}] 🤖 CODEX:")
        print(txt)
    else:
        print(f"\n[{ts}] ⚙️ {item_type}")

conn.close()

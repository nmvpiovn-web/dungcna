import sqlite3
import os
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
conn = sqlite3.connect(os.path.expanduser('~/.codex/thread_history_1.sqlite'))
c = conn.cursor()
c.execute("SELECT item_type, item_json FROM thread_items WHERE thread_id = '01a0d8cb-e7f2-72e3-b105-e06c43009750' ORDER BY created_at_ms ASC")
for r in c.fetchall():
    data = json.loads(r[1])
    t = r[0]
    if t == 'userMessage':
        txt = ''.join([item.get('text', '') for item in data.get('content', []) if item.get('type') == 'text'])
        print('\n>>> [USER]:', txt)
    elif t == 'agentMessage':
        print('\n<<< [CODEX]:', data.get('text') or '')

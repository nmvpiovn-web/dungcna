# -*- coding: utf-8 -*-
import sqlite3
import json
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect(os.path.expanduser('~/.codex/thread_history_1.sqlite'))
c = conn.cursor()
c.execute("SELECT item_type, item_json FROM thread_items WHERE thread_id = '01a0d8cb-e7f2-72e3-b105-e06c43009750' ORDER BY created_at_ms DESC LIMIT 8")
rows = c.fetchall()
for r in reversed(rows):
    data = json.loads(r[1])
    t = r[0]
    if t == 'userMessage':
        txt = ''.join([item.get('text', '') for item in data.get('content', []) if item.get('type') == 'text'])
        print(f"\n[USER]: {txt[:120]}...")
    elif t == 'agentMessage':
        print(f"\n[CODEX]:\n{data.get('text')}\n")
    elif t == 'commandExecution':
        print(f"\n[CMD]: {data.get('command')}")
        if data.get('output'):
            print(f"  OUTPUT: {data.get('output')[:150]}")
    else:
        print(f"\n[{t}]: {str(data)[:100]}")

# -*- coding: utf-8 -*-
"""
Codex Desktop Direct Bridge
Enables bidirectional communication between Antigravity and OpenAI Codex Desktop.
"""
import os
import sys
import json
import time
import sqlite3
import subprocess

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

CODEX_BIN = r"C:\Users\admin\AppData\Local\OpenAI\Codex\bin\13995fba801849b0\codex.exe"
CODEX_DIR = os.path.expanduser("~/.codex")
SESSION_INDEX_FILE = os.path.join(CODEX_DIR, "session_index.jsonl")
THREAD_DB_FILE = os.path.join(CODEX_DIR, "thread_history_1.sqlite")

def get_latest_thread_id():
    if not os.path.exists(SESSION_INDEX_FILE):
        return None
    with open(SESSION_INDEX_FILE, 'r', encoding='utf-8', errors='ignore') as f:
        lines = [line.strip() for line in f if line.strip()]
        if not lines:
            return None
        last_obj = json.loads(lines[-1])
        return last_obj.get("id")

def queue_message(thread_id, message):
    if not os.path.exists(CODEX_BIN):
        raise FileNotFoundError(f"Codex binary not found at: {CODEX_BIN}")
    
    cmd = [CODEX_BIN, "queue", "--thread", thread_id, "--message", message]
    res = subprocess.run(cmd, capture_output=True, text=True, errors='ignore')
    if res.returncode != 0:
        raise RuntimeError(f"Failed to queue message to Codex: {res.stderr or res.stdout}")
    return res.stdout.strip()

def get_latest_agent_reply(thread_id):
    if not os.path.exists(THREAD_DB_FILE):
        return None
    conn = sqlite3.connect(THREAD_DB_FILE)
    c = conn.cursor()
    c.execute(
        "SELECT item_json FROM thread_items WHERE thread_id = ? AND item_type = 'agentMessage' ORDER BY created_at_ms DESC LIMIT 1",
        (thread_id,)
    )
    row = c.fetchone()
    conn.close()
    if row:
        data = json.loads(row[0])
        return data.get("text", "")
    return None

def send_and_wait(message, timeout_sec=20):
    thread_id = get_latest_thread_id()
    if not thread_id:
        print("ERROR: No active Codex thread found.")
        return None

    print(f"[BRIDGE] Active Codex Thread: {thread_id}")
    initial_reply = get_latest_agent_reply(thread_id)
    
    queue_res = queue_message(thread_id, message)
    print(f"[BRIDGE] Message queued successfully: {queue_res}")
    
    # Wait for new agent reply
    start_time = time.time()
    while time.time() - start_time < timeout_sec:
        time.sleep(1.5)
        current_reply = get_latest_agent_reply(thread_id)
        if current_reply and current_reply != initial_reply:
            print("\n=== CODEX DESKTOP REPLY ===")
            print(current_reply)
            return current_reply
            
    print(f"[BRIDGE] Timeout waiting for reply after {timeout_sec}s. Current reply may be pending.")
    return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/codex_bridge.py <message>")
        thread_id = get_latest_thread_id()
        print(f"Current active thread: {thread_id}")
        reply = get_latest_agent_reply(thread_id)
        print(f"Latest reply: {reply}")
    else:
        msg = " ".join(sys.argv[1:])
        send_and_wait(msg)

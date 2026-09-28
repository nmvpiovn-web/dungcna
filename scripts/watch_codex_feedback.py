import os
import sys
import time
import json
from datetime import datetime

DOCS_DIR = r"C:\Users\admin\Documents\Codex"
ROLLOUT_FILE = os.path.expanduser(r"~/.codex/sessions/2026/09/25/rollout-2026-09-25T20-40-36-01a0d8cb-e7f2-72e3-b105-e06c43009750.jsonl")

# Record initial state
initial_files = {}
if os.path.exists(DOCS_DIR):
    for f in os.listdir(DOCS_DIR):
        fp = os.path.join(DOCS_DIR, f)
        if os.path.isfile(fp):
            initial_files[f] = os.path.getmtime(fp)

START_ORDINAL = 4105
if os.path.exists(ROLLOUT_FILE):
    initial_rollout_size = os.path.getsize(ROLLOUT_FILE)
else:
    initial_rollout_size = 0

print(f"[{datetime.now().strftime('%H:%M:%S')}] CODEX WATCHER STARTED")
print(f"Monitoring folder: {DOCS_DIR}")
print(f"Monitoring thread rollout from ordinal {START_ORDINAL}...")
sys.stdout.flush()

MAX_WAIT_SECONDS = 3600
poll_interval = 4
elapsed = 0

while elapsed < MAX_WAIT_SECONDS:
    time.sleep(poll_interval)
    elapsed += poll_interval

    # 1. Check for new or modified feedback files in Documents/Codex
    if os.path.exists(DOCS_DIR):
        current_files = os.listdir(DOCS_DIR)
        for f in current_files:
            if "HANDOFF" in f.upper():
                continue
            fp = os.path.join(DOCS_DIR, f)
            if not os.path.isfile(fp):
                continue
            mtime = os.path.getmtime(fp)
            if f not in initial_files or mtime > initial_files[f]:
                if any(k in f.upper() for k in ["FEEDBACK", "AUDIT", "MASTER_PLAN", "GATE", "46377AD", "G1_"]):
                    print(f"\n=======================================================")
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] DETECTED NEW/UPDATED CODEX FILE: {f}")
                    print(f"=======================================================\n")
                    try:
                        with open(fp, "r", encoding="utf-8", errors="ignore") as cf:
                            print(cf.read())
                    except Exception as e:
                        print(f"Error reading {f}: {e}")
                    sys.stdout.flush()
                    sys.exit(0)

    # 2. Check rollout for completion or assistant response
    if os.path.exists(ROLLOUT_FILE):
        try:
            with open(ROLLOUT_FILE, "r", encoding="utf-8", errors="ignore") as rf:
                lines = rf.readlines()
            
            # Look for lines after START_ORDINAL
            new_lines = []
            for l in lines:
                l_str = l.strip()
                if not l_str:
                    continue
                try:
                    obj = json.loads(l_str)
                    if obj.get("ordinal", 0) > START_ORDINAL:
                        new_lines.append(obj)
                except:
                    pass
            
            # Check if task_complete event occurred after START_ORDINAL
            task_completed = any(
                item.get("type") == "event_msg" and item.get("payload", {}).get("type") == "task_complete"
                for item in new_lines
            )

            assistant_msgs = []
            for item in new_lines:
                payload = item.get("payload", {})
                if payload.get("role") == "assistant" or item.get("role") == "assistant":
                    content = payload.get("content", [])
                    for c in content:
                        if isinstance(c, dict) and c.get("type") == "output_text":
                            assistant_msgs.append(c.get("text", ""))
                        elif isinstance(c, str):
                            assistant_msgs.append(c)

            if task_completed and assistant_msgs:
                print(f"\n=======================================================")
                print(f"[{datetime.now().strftime('%H:%M:%S')}] CODEX TASK COMPLETED IN THREAD!")
                print(f"=======================================================\n")
                print("\n\n".join(assistant_msgs))
                sys.stdout.flush()
                sys.exit(0)
        except Exception as e:
            pass

    if elapsed % 60 == 0:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Still listening for Codex response... ({elapsed}/{MAX_WAIT_SECONDS}s elapsed)")
        sys.stdout.flush()

print(f"[{datetime.now().strftime('%H:%M:%S')}] Watcher timeout reached after {MAX_WAIT_SECONDS}s.")
sys.exit(0)

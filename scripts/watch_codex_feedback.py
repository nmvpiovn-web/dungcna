import os
import sys
import time
import json
from datetime import datetime

DOCS_DIR = r"C:\Users\admin\Documents\Codex"
ROLLOUT_FILE = os.path.expanduser(r"~/.codex/sessions/2026/09/25/rollout-2026-09-25T20-40-36-01a0d8cb-e7f2-72e3-b105-e06c43009750.jsonl")

start_time = time.time()
initial_rollout_size = os.path.getsize(ROLLOUT_FILE) if os.path.exists(ROLLOUT_FILE) else 0

# Record initial files in Documents/Codex
initial_files = {}
if os.path.exists(DOCS_DIR):
    for f in os.listdir(DOCS_DIR):
        fp = os.path.join(DOCS_DIR, f)
        if os.path.isfile(fp):
            initial_files[f] = os.path.getmtime(fp)

print(f"[{datetime.now().strftime('%H:%M:%S')}] CODEX WATCHER STARTED")
print(f"Monitoring folder: {DOCS_DIR}")
print(f"Monitoring thread: 01a0d8cb-e7f2-72e3-b105-e06c43009750 (initial size: {initial_rollout_size} bytes)")
sys.stdout.flush()

MAX_WAIT_SECONDS = 3600 # 1 hour
poll_interval = 5
elapsed = 0

while elapsed < MAX_WAIT_SECONDS:
    time.sleep(poll_interval)
    elapsed += poll_interval

    # 1. Check for new or modified feedback / response files in Documents/Codex
    if os.path.exists(DOCS_DIR):
        current_files = os.listdir(DOCS_DIR)
        for f in current_files:
            if "HANDOFF" in f.upper():
                continue # Skip our own handoff files
            fp = os.path.join(DOCS_DIR, f)
            if not os.path.isfile(fp):
                continue
            mtime = os.path.getmtime(fp)
            if f not in initial_files or mtime > initial_files[f]:
                # File is newly created or modified!
                if "FEEDBACK" in f.upper() or "AUDIT" in f.upper() or "BDDECCB" in f.upper():
                    print(f"\n=======================================================")
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] DETECTED NEW/UPDATED CODEX FILE: {f}")
                    print(f"=======================================================\n")
                    try:
                        with open(fp, "r", encoding="utf-8", errors="ignore") as content_file:
                            print(content_file.read())
                    except Exception as e:
                        print(f"Error reading {f}: {e}")
                    sys.stdout.flush()
                    sys.exit(0)

    # 2. Check for new messages appended to the rollout file
    if os.path.exists(ROLLOUT_FILE):
        current_rollout_size = os.path.getsize(ROLLOUT_FILE)
        if current_rollout_size > initial_rollout_size:
            # New data in rollout!
            try:
                with open(ROLLOUT_FILE, "rb") as rf:
                    rf.seek(initial_rollout_size)
                    new_bytes = rf.read()
                    new_text = new_bytes.decode("utf-8", errors="ignore")
                    lines = [line.strip() for line in new_text.split("\n") if line.strip()]
                    
                    found_model_response = False
                    response_texts = []
                    for line in lines:
                        try:
                            obj = json.loads(line)
                            # Check for assistant or model response events
                            if obj.get("type") in ("assistant_message", "model_response", "message", "response"):
                                response_texts.append(json.dumps(obj, ensure_ascii=False, indent=2))
                                found_model_response = True
                            elif "content" in obj and obj.get("role") == "assistant":
                                response_texts.append(str(obj.get("content")))
                                found_model_response = True
                        except:
                            pass
                    
                    if found_model_response and response_texts:
                        print(f"\n=======================================================")
                        print(f"[{datetime.now().strftime('%H:%M:%S')}] DETECTED CODEX ASSISTANT RESPONSE IN THREAD!")
                        print(f"=======================================================\n")
                        print("\n---\n".join(response_texts))
                        sys.stdout.flush()
                        sys.exit(0)
            except Exception as e:
                pass

    if elapsed % 60 == 0:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Still listening for Codex response... ({elapsed}/{MAX_WAIT_SECONDS}s elapsed)")
        sys.stdout.flush()

print(f"[{datetime.now().strftime('%H:%M:%S')}] Watcher timeout reached after {MAX_WAIT_SECONDS}s.")
sys.exit(0)

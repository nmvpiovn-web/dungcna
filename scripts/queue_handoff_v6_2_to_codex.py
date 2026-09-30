# -*- coding: utf-8 -*-
"""
Queue V6.2 Remediation & Deploy Request Handoff to Codex Desktop thread 01a0ed99-5c76-7301-ba25-edc288300046.
"""
import subprocess
import sys
import os

CODEX_BIN = r"C:\Users\admin\AppData\Local\OpenAI\Codex\bin\faa963e871dd422c\codex.exe"
THREAD_ID = "01a0ed99-5c76-7301-ba25-edc288300046"
HANDOFF_FILE = r"C:\Users\admin\Documents\Codex\HANDOFF_ANTIGRAVITY_TO_CODEX_V6_2_DEPLOY_REQUEST_2026-09-30.md"

try:
    with open(HANDOFF_FILE, 'r', encoding='utf-8') as f:
        message = f.read()
except FileNotFoundError:
    print(f"[ERROR] Handoff file not found: {HANDOFF_FILE}")
    sys.exit(1)

print(f"[INFO] Queuing V6.2 remediation & deploy request to Codex thread {THREAD_ID}")
print(f"[INFO] Message length: {len(message)} chars")

if not os.path.exists(CODEX_BIN):
    print(f"[WARN] Codex binary not found at: {CODEX_BIN}")
    sys.exit(1)

try:
    result = subprocess.run(
        [CODEX_BIN, "queue", "--thread", THREAD_ID, "--message", message],
        capture_output=True, text=True, timeout=60, encoding='utf-8'
    )
    if result.returncode == 0:
        print(f"[OK] V6.2 handoff queued successfully to Codex thread {THREAD_ID}")
        print(result.stdout)
    else:
        print(f"[WARN] Codex CLI queue returned code {result.returncode}")
        print("stdout:", result.stdout)
        print("stderr:", result.stderr)
except subprocess.TimeoutExpired:
    print("[WARN] Codex CLI timed out.")
except Exception as e:
    print(f"[WARN] Could not invoke Codex CLI: {e}")

print("[INFO] Handoff file is located at:")
print(HANDOFF_FILE)

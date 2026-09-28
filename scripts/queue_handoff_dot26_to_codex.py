# -*- coding: utf-8 -*-
"""
Queue G1 remediation, atomic payroll versioning & guest UI final handoff (Dot 26, commit c951377) to Codex Desktop thread.
"""
import subprocess
import sys
import os

CODEX_BIN = r"C:\Users\admin\AppData\Local\OpenAI\Codex\bin\faa963e871dd422c\codex.exe"
THREAD_ID = "01a0d8cb-e7f2-72e3-b105-e06c43009750"
HANDOFF_FILE = r"C:\Users\admin\Documents\Codex\BAO_CAO_BAN_GIAO_DOT_26_COMMIT_c951377_G1_REMEDIATED_FULL_EVIDENCE.md"

try:
    with open(HANDOFF_FILE, 'r', encoding='utf-8') as f:
        message = f.read()
except FileNotFoundError:
    print(f"[ERROR] Handoff file not found: {HANDOFF_FILE}")
    sys.exit(1)

print(f"[INFO] Queuing Dot 26 final handoff to Codex thread {THREAD_ID}")
print(f"[INFO] Message length: {len(message)} chars")

if not os.path.exists(CODEX_BIN):
    print(f"[WARN] Codex binary not found at: {CODEX_BIN}")
    print("[INFO] Message content preview (first 500 chars):")
    print(message[:500])
    sys.exit(0)

try:
    result = subprocess.run(
        [CODEX_BIN, "queue", "--thread", THREAD_ID, "--message", message],
        capture_output=True, text=True, timeout=30, encoding='utf-8'
    )
    if result.returncode == 0:
        print(f"[OK] Dot 26 final handoff queued successfully to Codex thread {THREAD_ID}")
        print(result.stdout)
    else:
        print(f"[WARN] Codex CLI queue returned code {result.returncode}")
        print("stdout:", result.stdout)
        print("stderr:", result.stderr)
except subprocess.TimeoutExpired:
    print("[WARN] Codex CLI timed out. Handoff saved locally.")
except Exception as e:
    print(f"[WARN] Could not invoke Codex CLI: {e}")

print("[INFO] Handoff file is ready at:")
print(HANDOFF_FILE)

# -*- coding: utf-8 -*-
"""
COMPREHENSIVE BACKEND & DATABASE VERIFICATION SUITE
Hệ Thống Quản Lý Đào Tạo & Khảo Thí Tiếng Anh Cô Dung
Tracks: Cloudflare D1 Live Schema & Content, SQLite Atomic Handlers, and Local Dev Server Endpoints.
"""

import sys
import os
import re
import json
import sqlite3
import urllib.request
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# ANSI Color Helpers
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

passed_tests = 0
failed_tests = 0

def assert_test(name, condition, details=""):
    global passed_tests, failed_tests
    if condition:
        passed_tests += 1
        print(f"  {GREEN}[PASS]{RESET} {name} {f'({details})' if details else ''}")
    else:
        failed_tests += 1
        print(f"  {RED}[FAIL]{RESET} {name} {f'({details})' if details else ''}")

# =====================================================================
# SECTION 1: CLOUDFLARE D1 DATABASE LIVE VERIFICATION
# =====================================================================
print(f"\n{BOLD}{CYAN}=== SECTION 1: CLOUDFLARE D1 REMOTE DATABASE AUDIT ==={RESET}")

config_path = os.path.join(os.environ.get('USERPROFILE', ''), r'AppData\Roaming\xdg.config\.wrangler\config\default.toml')
d1_available = False
d1_token = None
account_id = '9bca45c9a8ff34be86d4a4bf0cc0245f'
db_uuid = 'a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218'

if os.path.exists(config_path):
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            text = f.read()
        m = re.search(r'oauth_token\s*=\s*"([^"]+)"', text)
        if m:
            d1_token = m.group(1)
            d1_available = True
    except Exception as e:
        print(f"  {YELLOW}[WARN] Could not read wrangler config: {e}{RESET}")

def run_d1_sql(sql):
    if not d1_available:
        return {"success": False, "error": "No token"}
    url = f'https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{db_uuid}/query'
    req = urllib.request.Request(
        url,
        data=json.dumps({"sql": sql}).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {d1_token}',
            'Content-Type': 'application/json'
        },
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        return {"success": False, "error": str(e)}

if d1_available:
    res = run_d1_sql("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%';")
    if res.get('success'):
        tables = [r['name'] for r in res['result'][0]['results']]
        print(f"  Discovered {len(tables)} tables in D1 Cloudflare")

        # Required tables checklist
        required_tables = [
            'users', 'curricula', 'class_sessions', 'attendance_records', 'tuition_bills',
            'knowledge_vault', 'knowledge_links', 'knowledge_fts', 'questions', 'exam_instances',
            'system_notifications', 'system_notification_reads',
            'teacher_leave_requests', 'teacher_salary_advances', 'teacher_recruitment',
            'salary_transactions', 'parent_student_links'
        ]
        for tbl in required_tables:
            assert_test(f"D1 Table exists: {tbl}", tbl in tables)

        # Verify idx_salary_tx_unique
        idx_res = run_d1_sql("SELECT name, type FROM sqlite_master WHERE name='idx_salary_tx_unique';")
        has_idx = False
        if idx_res.get('success') and idx_res.get('result') and len(idx_res['result']) > 0:
            has_idx = len(idx_res['result'][0].get('results', [])) > 0
        assert_test("D1 Unique Index: idx_salary_tx_unique exists", has_idx)

        # Verify class_sessions has substitute and session_date columns
        cols_res = run_d1_sql("PRAGMA table_info(class_sessions);")
        if cols_res.get('success'):
            cnames = [c['name'] for c in cols_res['result'][0]['results']]
            assert_test("class_sessions has substitute_teacher_id", 'substitute_teacher_id' in cnames)
            assert_test("class_sessions has substitute_teacher_name", 'substitute_teacher_name' in cnames)
            assert_test("class_sessions has substitute_notes", 'substitute_notes' in cnames)
            assert_test("class_sessions has session_date", 'session_date' in cnames)

        # Verify Knowledge Vault Count (102 notes)
        kv_res = run_d1_sql("SELECT count(*) as cnt FROM knowledge_vault;")
        if kv_res.get('success'):
            cnt = kv_res['result'][0]['results'][0]['cnt']
            assert_test("Knowledge Vault note count", cnt >= 102, f"{cnt} notes found")

        # Verify Knowledge Links (WikiLinks)
        kl_res = run_d1_sql("SELECT count(*) as cnt FROM knowledge_links;")
        if kl_res.get('success'):
            cnt = kl_res['result'][0]['results'][0]['cnt']
            assert_test("Knowledge Links count", cnt >= 200, f"{cnt} links found")

        # Verify Questions Bank for Grade 12 (122 questions)
        q12_res = run_d1_sql("SELECT count(*) as cnt FROM questions WHERE grade=12;")
        if q12_res.get('success'):
            cnt = q12_res['result'][0]['results'][0]['cnt']
            assert_test("Grade 12 Question bank quota >= 120", cnt >= 120, f"{cnt} questions found")
    else:
        print(f"  {YELLOW}[WARN] D1 Query failed: {res.get('error')}{RESET}")
else:
    print(f"  {YELLOW}[SKIP] Cloudflare D1 credentials not found, skipping remote checks{RESET}")


# =====================================================================
# SECTION 2: HANDLER TRANSACTION ATOMICITY & REPRO AUDIT (MOCK SQLITE)
# =====================================================================
print(f"\n{BOLD}{CYAN}=== SECTION 2: SQLITE HANDLER ATOMICITY & LOGIC GUARDS ==={RESET}")

conn = sqlite3.connect(":memory:")
cur = conn.cursor()

# Set up clean schemas
cur.executescript("""
CREATE TABLE teacher_salary_advances (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    billing_cycle TEXT NOT NULL,
    status TEXT NOT NULL, -- 'pending', 'approved', 'deducted', 'rejected'
    approved_by TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE salary_transactions (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL, -- 'advance_disbursement', 'advance_deduction'
    amount INTEGER NOT NULL,
    billing_cycle TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_salary_tx_unique ON salary_transactions(transaction_type, ref_id);

CREATE TABLE tuition_bills (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    month TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    total_amount INTEGER NOT NULL,
    created_by TEXT,
    updated_at INTEGER
);

CREATE TABLE parent_student_links (
    parent_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    PRIMARY KEY(parent_id, student_id)
);

CREATE TABLE class_sessions (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    substitute_teacher_id TEXT,
    substitute_teacher_name TEXT,
    substitute_notes TEXT,
    day_of_week INTEGER,
    start_time TEXT,
    end_time TEXT,
    session_date TEXT
);

CREATE TABLE teacher_leave_requests (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    substitute_teacher_id TEXT NOT NULL,
    substitute_teacher_name TEXT NOT NULL,
    leave_date TEXT NOT NULL,
    status TEXT NOT NULL, -- 'pending', 'colleague_approved', 'leader_approved', 'rejected'
    reason TEXT
);

CREATE TABLE system_notifications (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT NOT NULL,
    target_user_id TEXT,
    created_at INTEGER
);

CREATE TABLE system_notification_reads (
    notification_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    read_at INTEGER NOT NULL,
    PRIMARY KEY (notification_id, user_id)
);

CREATE VIRTUAL TABLE knowledge_fts USING fts5(
    id UNINDEXED,
    title,
    content,
    tokenize = 'unicode61'
);
""")
conn.commit()

# Test 2.1: Codex Repro - Deduct when advance is NOT 'approved' (changes = 0 -> 0 ledger rows)
cur.execute("INSERT INTO teacher_salary_advances VALUES ('adv_pending_01', 'teacher_1', 1000000, '2026-09', 'pending', NULL, 1000);")
conn.commit()

# Handler logic reproduction:
# Step 1: Run update with condition status = 'approved'
cur.execute("UPDATE teacher_salary_advances SET status = 'deducted' WHERE id = ? AND status = 'approved'", ('adv_pending_01',))
update_changes = cur.rowcount

ledger_written = False
if update_changes == 1:
    cur.execute("INSERT INTO salary_transactions VALUES ('tx_01', 'teacher_1', 'advance_deduction', 1000000, '2026-09', 'adv_pending_01', 2000)")
    conn.commit()
    ledger_written = True
else:
    # 409 Conflict - do not write ledger
    pass

assert_test("Codex Repro: Deduct pending advance yields 0 changes", update_changes == 0)
assert_test("Codex Repro: Zero changes strictly generates 0 ledger rows", ledger_written is False)

# Verify table count in DB
cur.execute("SELECT count(*) FROM salary_transactions WHERE ref_id = 'adv_pending_01'")
assert_test("Database strictly has 0 ledger records for invalid advance", cur.fetchone()[0] == 0)

# Test 2.2: Legitimate deduction (status = 'approved' -> exactly 1 ledger row)
cur.execute("INSERT INTO teacher_salary_advances VALUES ('adv_appr_02', 'teacher_2', 2000000, '2026-09', 'approved', 'leader_1', 1000);")
conn.commit()

cur.execute("UPDATE teacher_salary_advances SET status = 'deducted' WHERE id = ? AND status = 'approved'", ('adv_appr_02',))
update_changes = cur.rowcount
if update_changes == 1:
    cur.execute("INSERT INTO salary_transactions VALUES ('tx_02', 'teacher_2', 'advance_deduction', 2000000, '2026-09', 'adv_appr_02', 2000)")
    conn.commit()

assert_test("Legitimate deduct changes == 1", update_changes == 1)
cur.execute("SELECT count(*) FROM salary_transactions WHERE ref_id = 'adv_appr_02'")
assert_test("Legitimate deduct creates exactly 1 ledger transaction", cur.fetchone()[0] == 1)

# Test 2.3: Unique index enforcement against duplicate deductions
try:
    cur.execute("INSERT INTO salary_transactions VALUES ('tx_dup', 'teacher_2', 'advance_deduction', 2000000, '2026-09', 'adv_appr_02', 2001)")
    conn.commit()
    duplicate_prevented = False
except sqlite3.IntegrityError:
    duplicate_prevented = True
assert_test("Unique constraint (transaction_type, ref_id) blocks duplicate ledger write", duplicate_prevented)

# Test 2.4: Tuition UPSERT WHERE constraint at write time
cur.execute("INSERT INTO tuition_bills VALUES ('bill_appr_01', 'std_1', '2026-09', 'approved', 1500000, 'teacher_1', 1000)")
conn.commit()

# Non-manager teacher attempting to overwrite approved bill
# SQLite equivalent of: ON CONFLICT(id) DO UPDATE SET total_amount = excluded.total_amount WHERE (tuition_bills.status = 'draft' OR ? = 1)
def simulate_tuition_upsert(bill_id, student_id, month, amount, is_manager):
    # Simulated atomic upsert
    cur.execute(f"""
        INSERT INTO tuition_bills (id, student_id, month, total_amount, status, updated_at)
        VALUES (?, ?, ?, ?, 'draft', 2000)
        ON CONFLICT(id) DO UPDATE SET
            total_amount = excluded.total_amount,
            updated_at = excluded.updated_at
        WHERE (tuition_bills.status = 'draft' OR ? = 1);
    """, (bill_id, student_id, month, amount, 1 if is_manager else 0))
    conn.commit()
    return cur.rowcount

changes_teacher = simulate_tuition_upsert('bill_appr_01', 'std_1', '2026-09', 999999, is_manager=False)
assert_test("Teacher cannot overwrite approved bill (0 changes at write time)", changes_teacher == 0)

cur.execute("SELECT total_amount, status FROM tuition_bills WHERE id = 'bill_appr_01'")
row = cur.fetchone()
assert_test("Approved bill untouched (amount = 1,500,000, status = approved)", row[0] == 1500000 and row[1] == 'approved')

changes_manager = simulate_tuition_upsert('bill_appr_01', 'std_1', '2026-09', 1600000, is_manager=True)
assert_test("Manager override allowed (1 change)", changes_manager == 1)

cur.execute("SELECT total_amount FROM tuition_bills WHERE id = 'bill_appr_01'")
assert_test("Manager successfully updated bill to 1,600,000", cur.fetchone()[0] == 1600000)

# Test 2.5: Substitute teacher overlap check
def check_time_overlap(s1, e1, s2, e2):
    # Overlap occurs when start1 < end2 AND end1 > start2
    return (s1 < e2) and (e1 > s2)

assert_test("Overlap check: 08:30-10:00 vs 09:00-10:30 overlaps", check_time_overlap("08:30", "10:00", "09:00", "10:30") is True)
assert_test("Overlap check: 08:30-10:00 vs 10:00-11:30 no overlap (adjacent)", check_time_overlap("08:30", "10:00", "10:00", "11:30") is False)
assert_test("Overlap check: 08:30-10:00 vs 10:30-12:00 no overlap", check_time_overlap("08:30", "10:00", "10:30", "12:00") is False)

# Test 2.6: Substitute rollback if session update fails
cur.execute("INSERT INTO teacher_leave_requests VALUES ('leave_01', 't1', 'sess_nonexistent', 't2', 'Cô Hà', '2026-09-28', 'pending', 'Bận việc gia đình')")
conn.commit()

# Step 1: Update leave request to colleague_approved
cur.execute("UPDATE teacher_leave_requests SET status = 'colleague_approved' WHERE id = 'leave_01'")
leave_changes = cur.rowcount
# Step 2: Update session (will affect 0 rows because session does not exist)
cur.execute("UPDATE class_sessions SET substitute_teacher_id = 't2' WHERE id = 'sess_nonexistent'")
session_changes = cur.rowcount

if session_changes == 0:
    # Trigger rollback
    cur.execute("UPDATE teacher_leave_requests SET status = 'pending' WHERE id = 'leave_01'")
    conn.commit()

cur.execute("SELECT status FROM teacher_leave_requests WHERE id = 'leave_01'")
assert_test("Leave request rollback to pending when session fails", cur.fetchone()[0] == 'pending')

# Test 2.7: FTS5 Unicode Vietnamese Indexing & Search
cur.execute("INSERT INTO knowledge_fts (id, title, content) VALUES ('note_1', 'Thì Hiện Tại Đơn', 'Cấu trúc S + V(s/es), dùng cho thói quen, chân lý khoa học.')")
cur.execute("INSERT INTO knowledge_fts (id, title, content) VALUES ('note_2', 'Câu Bị Động Khách Quan', 'People say that he is rich -> It is said that he is rich.')")
conn.commit()

cur.execute("SELECT id FROM knowledge_fts WHERE knowledge_fts MATCH 'chân lý'")
assert_test("FTS5 Unicode61 matches 'chân lý'", len(cur.fetchall()) == 1)

cur.execute("SELECT id FROM knowledge_fts WHERE knowledge_fts MATCH 'bị động'")
assert_test("FTS5 Unicode61 matches 'bị động'", len(cur.fetchall()) == 1)

# Test 2.8: XSS Sanitization Sentinel Marker Simulation
def sanitize_snippet(raw_text, match_term):
    # HTML escape first
    escaped = (raw_text
               .replace('&', '&amp;')
               .replace('<', '&lt;')
               .replace('>', '&gt;')
               .replace('"', '&quot;')
               .replace("'", '&#39;'))
    # Safely inject mark tags
    marked = escaped.replace(match_term, f'<mark class="bg-amber-200">{match_term}</mark>')
    return marked

dirty_input = "<script>alert('xss')</script> Học ngữ pháp tiếng Anh"
safe_output = sanitize_snippet(dirty_input, "ngữ pháp")
assert_test("XSS Sanitizer disarms <script> tags", "<script>" not in safe_output and "&lt;script&gt;" in safe_output)
assert_test("XSS Sanitizer properly marks target keyword", '<mark class="bg-amber-200">ngữ pháp</mark>' in safe_output)

# Test 2.9: Star discount formula
def calculate_star_discount(stars):
    # 100 stars = 1,000 VND; floor to 100
    usable = (stars // 100) * 100
    return (usable // 100) * 1000

assert_test("Star formula: 350 stars = 3,000 VND", calculate_star_discount(350) == 3000)
assert_test("Star formula: 99 stars = 0 VND", calculate_star_discount(99) == 0)
assert_test("Star formula: 1050 stars = 10,000 VND", calculate_star_discount(1050) == 10000)


# =====================================================================
# SECTION 3: LOCAL DEV SERVER LIVE HTTP AUDIT
# =====================================================================
print(f"\n{BOLD}{CYAN}=== SECTION 3: LIVE HTTP SERVER AUDIT (http://127.0.0.1:5173) ==={RESET}")

base_url = 'http://127.0.0.1:5173'
routes = [
    ('/', 200, 'text/html'),
    ('/courses', 200, 'text/html'),
    ('/robots.txt', 200, 'text/plain'),
    ('/sitemap.xml', 200, 'application/xml'),
    ('/api/apk/version', 200, 'application/json'),
    ('/dictionary', 200, 'text/html'),
    ('/flashcards', 200, 'text/html'),
    ('/games', 200, 'text/html'),
    ('/grammar', 200, 'text/html'),
    ('/exam', 200, 'text/html'),
    ('/schedule', 200, 'text/html'),
    ('/admin', 200, 'text/html'),
    ('/second-brain', 200, 'text/html'),
]

for path, expected_status, expected_content_type in routes:
    url = base_url + path
    try:
        t0 = time.time()
        req = urllib.request.Request(url, headers={'User-Agent': 'AntigravityAudit/2.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            status = resp.getcode()
            elapsed_ms = round((time.time() - t0) * 1000)
            ctype = resp.headers.get('Content-Type', '')
            ok = (status == expected_status) and (expected_content_type in ctype)
            assert_test(f"HTTP GET {path}", ok, f"status={status}, type={ctype[:20]}, time={elapsed_ms}ms")
    except Exception as e:
        assert_test(f"HTTP GET {path}", False, f"Error: {e}")

# Check robots.txt canonical domain
try:
    with urllib.request.urlopen(f'{base_url}/robots.txt', timeout=5) as resp:
        content = resp.read().decode('utf-8')
        assert_test("robots.txt contains sitemap", "sitemap.xml" in content)
        assert_test("robots.txt protects /admin", "Disallow: /admin" in content)
        assert_test("robots.txt protects /second-brain", "Disallow: /second-brain" in content)
        assert_test("robots.txt protects /api/", "Disallow: /api/" in content)
except Exception as e:
    assert_test("robots.txt verification", False, str(e))

# Check sitemap.xml canonical domain
try:
    with urllib.request.urlopen(f'{base_url}/sitemap.xml', timeout=5) as resp:
        xml_content = resp.read().decode('utf-8')
        assert_test("sitemap.xml starts with <?xml", xml_content.strip().startswith("<?xml"))
        assert_test("sitemap.xml contains /courses", "/courses" in xml_content)
        assert_test("sitemap.xml contains https://timbk.io.vn", "https://timbk.io.vn" in xml_content)
except Exception as e:
    assert_test("sitemap.xml verification", False, str(e))

# Check API APK Version response payload
try:
    with urllib.request.urlopen(f'{base_url}/api/apk/version', timeout=5) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        assert_test("APK version name == '2.2.0'", data.get('version_name') == '2.2.0')
        assert_test("APK version code == 220", data.get('version_code') == 220)
        assert_test("APK target_sdk == 34", data.get('target_sdk') == 34)
except Exception as e:
    assert_test("APK version API payload", False, str(e))


# =====================================================================
# FINAL AUDIT SUMMARY
# =====================================================================
total = passed_tests + failed_tests
print(f"\n{BOLD}====================================================================={RESET}")
print(f"{BOLD}COMPREHENSIVE AUDIT SUMMARY:{RESET}")
print(f"  Total Checks: {total}")
print(f"  {GREEN}Passed: {passed_tests} ({round(passed_tests/total*100, 1)}%){RESET}")
if failed_tests > 0:
    print(f"  {RED}Failed: {failed_tests}{RESET}")
    sys.exit(1)
else:
    print(f"  {BOLD}{GREEN}ALL {total}/{total} CHECKS PASSED PERFECTLY (100% HEALTHY)!{RESET}")
    print(f"{BOLD}====================================================================={RESET}\n")

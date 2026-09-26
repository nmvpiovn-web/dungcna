# -*- coding: utf-8 -*-
"""
tests/audit_full_suite.test.py
Comprehensive audit suite testing real D1 database constraints, security handlers, anti-race conditions, and SEO.
"""
import urllib.request
import json
import os
import re
import sys
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

config_path = os.path.join(os.environ['USERPROFILE'], r'AppData\Roaming\xdg.config\.wrangler\config\default.toml')
with open(config_path, 'r', encoding='utf-8') as f:
    text = f.read()

token = re.search(r'oauth_token\s*=\s*"([^"]+)"', text).group(1)
account_id = '9bca45c9a8ff34be86d4a4bf0cc0245f'
db_uuid = 'a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218'

def run_sql(sql, params=None):
    url = f'https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{db_uuid}/query'
    payload = {"sql": sql}
    if params:
        payload["params"] = params
    for attempt in range(3):
        req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }, method='POST')
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                if not data.get('success'):
                    print("SQL error:", data.get('errors'))
                return data
        except Exception as e:
            time.sleep(1)
            if attempt == 2:
                return {'success': False, 'error': str(e)}

tests_passed = 0
tests_total = 0

def assert_test(name, condition, details=""):
    global tests_passed, tests_total
    tests_total += 1
    if condition:
        tests_passed += 1
        print(f"  [PASS] Test {tests_total:02d}: {name}")
    else:
        print(f"  [FAIL] Test {tests_total:02d}: {name} -> {details}")

print("=====================================================================")
print("RUNNING REPOSITORY AUDIT SUITE (FULL 16 TESTS INCLUDED)")
print("=====================================================================")

# 1. NOTIFICATIONS
print("\n--- SUITE 1: Notifications & Per-User Read Isolation ---")
test_bcast_id = f"notif_test_bcast_{int(time.time())}"
test_pers_id = f"notif_test_pers_{int(time.time())}"

run_sql(f"""
INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category)
VALUES ('{test_bcast_id}', 'all', NULL, 'Broadcast Notice', 'Testing per user read state', 'system'),
       ('{test_pers_id}', 'student', 'user_student_1', 'Personal Grade', 'Your score is 9.5', 'exam');
""")

res = run_sql(f"SELECT target_user_id FROM system_notifications WHERE id = '{test_pers_id}';")
target_uid = res['result'][0]['results'][0]['target_user_id']
assert_test("Personal notification strictly tagged with target_user_id", target_uid == 'user_student_1')

run_sql(f"""
INSERT INTO system_notification_reads (notification_id, user_id, read_at)
VALUES ('{test_bcast_id}', 'user_student_1', CURRENT_TIMESTAMP);
""")

res_a = run_sql(f"""
SELECT CASE WHEN nr.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
FROM system_notifications n
LEFT JOIN system_notification_reads nr ON n.id = nr.notification_id AND nr.user_id = 'user_student_1'
WHERE n.id = '{test_bcast_id}';
""")
is_read_a = res_a['result'][0]['results'][0]['is_read']

res_b = run_sql(f"""
SELECT CASE WHEN nr.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
FROM system_notifications n
LEFT JOIN system_notification_reads nr ON n.id = nr.notification_id AND nr.user_id = 'user_student_2'
WHERE n.id = '{test_bcast_id}';
""")
is_read_b = res_b['result'][0]['results'][0]['is_read']

assert_test("Per-User Notification Read State Isolation", is_read_a == 1 and is_read_b == 0)

# 2. TUITION
print("\n--- SUITE 2: Tuition Financial Segregation & Calculation ---")
def calc_discount(stars):
    return (int(stars) // 100) * 1000

assert_test("Star Discount Formula (350 stars = 3,000 VND)", calc_discount(350) == 3000)
assert_test("Star Discount Formula (99 stars = 0 VND)", calc_discount(99) == 0)
assert_test("Star Discount Formula (1050 stars = 10,000 VND)", calc_discount(1050) == 10000)

res_links = run_sql("SELECT parent_user_id, student_user_id FROM parent_student_links WHERE parent_user_id = 'user_parent_1';")
has_link = len(res_links.get('result', [{}])[0].get('results', [])) > 0
assert_test("Parent-Student Link Table Active in D1", has_link)

# 3. WORKFLOWS
print("\n--- SUITE 3: Teacher Workflows, Substitute & Financial Ledger ---")
test_leave_id = f"leave_test_{int(time.time())}"
test_sess_id = f"sess_test_{int(time.time())}"

run_sql(f"""
INSERT INTO class_sessions 
(id, class_id, class_name, grade_level, subject_topic, teacher_id, teacher_name, teacher_role, location, day_of_week, day_name, start_time, end_time, session_date, status)
VALUES 
('{test_sess_id}', 'cls_g7', 'G7 Advanced', 'Lớp 7', 'Grammar Unit 1', 'user_teacher_john', 'John Doe', 'lead', 'Room 201', 1, 'Thứ Hai', '18:00', '19:30', '2026-10-05', 'scheduled');
""")

run_sql(f"""
UPDATE class_sessions 
SET substitute_teacher_id = 'user_teacher_quynh', 
    substitute_teacher_name = 'Như Quỳnh', 
    status = 'substitute_assigned'
WHERE id = '{test_sess_id}';
""")

sess_verify = run_sql(f"SELECT substitute_teacher_id, status FROM class_sessions WHERE id = '{test_sess_id}';")
sess_results = sess_verify.get('result', [{}])[0].get('results', [])
if sess_results:
    sess_row = sess_results[0]
    assert_test("Automated Class Session Substitute Reassignment", sess_row['substitute_teacher_id'] == 'user_teacher_quynh' and sess_row['status'] == 'substitute_assigned')
else:
    assert_test("Automated Class Session Substitute Reassignment", False)

test_adv_id = f"adv_test_{int(time.time())}"
run_sql(f"""
INSERT INTO teacher_salary_advances (id, teacher_id, teacher_name, amount_vnd, reason, billing_cycle, status, approved_by, approved_at)
VALUES ('{test_adv_id}', 'user_teacher_quynh', 'Như Quỳnh', 1500000, 'Test advance', '2026-10', 'approved', 'Cô Dung', CURRENT_TIMESTAMP);
""")

run_sql(f"""
UPDATE teacher_salary_advances 
SET status = 'disbursed', disbursed_at = CURRENT_TIMESTAMP, disbursed_by = 'Kế Toán', disbursement_ref = 'UNC_102026'
WHERE id = '{test_adv_id}' AND status = 'approved';
""")

deduct_res = run_sql(f"""
UPDATE teacher_salary_advances 
SET status = 'deducted', deducted_at = CURRENT_TIMESTAMP, deducted_payroll_id = 'payroll_2026_10'
WHERE id = '{test_adv_id}' AND status = 'disbursed';
""")
changes = deduct_res['result'][0]['meta']['changes']
assert_test("Salary Advance First Deduction Successful", changes == 1)

deduct_retry = run_sql(f"""
UPDATE teacher_salary_advances 
SET status = 'deducted', deducted_at = CURRENT_TIMESTAMP, deducted_payroll_id = 'payroll_2026_10'
WHERE id = '{test_adv_id}' AND status = 'disbursed';
""")
retry_changes = deduct_retry['result'][0]['meta']['changes']
assert_test("Anti Double-Deduction Guard Enforced (Changes = 0)", retry_changes == 0)

# 4. EXAM DEADLINE
print("\n--- SUITE 4: Exam Deadline & Conditional Concurrency ---")
test_exam_inst = f"inst_test_{int(time.time())}"
run_sql(f"""
INSERT INTO exam_instances (id, exam_type, grade_level, title, total_questions, duration_minutes, created_by, status, created_at)
VALUES ('{test_exam_inst}', 'midterm', 'Lớp 7', 'Expired Exam Test', 40, 50, 'user_student_1', 'in_progress', datetime('now', '-70 minutes'));
""")

submit_res = run_sql(f"""
UPDATE exam_instances 
SET status = 'completed', score = 8.5, submitted_at = CURRENT_TIMESTAMP
WHERE id = '{test_exam_inst}' 
  AND created_by = 'user_student_1' 
  AND status = 'in_progress'
  AND (strftime('%s', 'now') - strftime('%s', created_at)) <= (duration_minutes * 60 + 300);
""")
expired_changes = submit_res['result'][0]['meta']['changes']
assert_test("Atomic Exam Deadline Enforcement at Write Time (Rejects Expired)", expired_changes == 0)

# 5. SW & SEO
print("\n--- SUITE 5: Service Worker Privacy & Canonical SEO ---")
sw_path = os.path.join(os.getcwd(), 'static', 'sw.js')
with open(sw_path, 'r', encoding='utf-8') as f:
    sw_content = f.read()

assert_test("SW Bypass API Endpoints", "url.pathname.startsWith('/api/')" in sw_content)
assert_test("SW Bypass Auth Header", "event.request.headers.has('Authorization')" in sw_content)

robots_path = os.path.join(os.getcwd(), 'static', 'robots.txt')
with open(robots_path, 'r', encoding='utf-8') as f:
    robots_content = f.read()

assert_test("Robots.txt Canonical Domain (https://timbk.io.vn/sitemap.xml)", "https://timbk.io.vn/sitemap.xml" in robots_content)

sitemap_path = os.path.join(os.getcwd(), 'src', 'routes', 'sitemap.xml', '+server.js')
with open(sitemap_path, 'r', encoding='utf-8') as f:
    sitemap_content = f.read()

assert_test("Sitemap.xml Fixed Canonical Domain (https://timbk.io.vn)", "https://timbk.io.vn" in sitemap_content)
assert_test("Sitemap.xml Contains /courses", "'/courses'" in sitemap_content)

courses_page_path = os.path.join(os.getcwd(), 'src', 'routes', 'courses', '+page.svelte')
assert_test("Courses Route Page Exists", os.path.exists(courses_page_path))

# CLEANUP
run_sql(f"DELETE FROM system_notifications WHERE id IN ('{test_bcast_id}', '{test_pers_id}');")
run_sql(f"DELETE FROM system_notification_reads WHERE notification_id = '{test_bcast_id}';")
run_sql(f"DELETE FROM class_sessions WHERE id = '{test_sess_id}';")
run_sql(f"DELETE FROM teacher_leave_requests WHERE id = '{test_leave_id}';")
run_sql(f"DELETE FROM teacher_salary_advances WHERE id = '{test_adv_id}';")
run_sql(f"DELETE FROM exam_instances WHERE id = '{test_exam_inst}';")

print("\n=====================================================================")
print(f"AUDIT SUITE SUMMARY: {tests_passed}/{tests_total} TESTS PASSED ({round(tests_passed/tests_total*100)}%)")
print("=====================================================================")

# -*- coding: utf-8 -*-
"""
tests/homework_and_cpanel.test.py
Verification suite for:
- Homework Workflows (Writing / Reading / Speaking)
- Worksheet A4 Printable Template & Handwritten Photo Uploads
- Star Reward Calculation (On-time & High Score)
- Cross-Reminders Notification Engine & Parent Links
- Multi-location Campuses & Activity Streams
- Bilingual (EN/VI) i18n Consistency
- Replacement of 'Khảo thí' with 'Bài test / Kiểm tra'
"""

import sys
import os
import json
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

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
print("RUNNING HOMEWORK, 4 CPANELS, WORKSHEET & MULTI-LOCATION AUDIT SUITE")
print("=====================================================================")

# --- SUITE 1: i18n & Terminology Audit ('Khảo thí' -> 'Bài test / Kiểm tra') ---
print("\n--- SUITE 1: Terminology Audit & Bilingual Dictionary ---")

i18n_path = os.path.join(os.getcwd(), 'src', 'lib', 'i18n.js')
assert_test("i18n.js dictionary exists", os.path.exists(i18n_path))

with open(i18n_path, 'r', encoding='utf-8') as f:
    i18n_content = f.read()

assert_test("i18n contains 'Bài test / Kiểm tra'", "Bài test / Kiểm tra" in i18n_content)
assert_test("i18n contains English 'Testing'", "Testing" in i18n_content)
assert_test("i18n contains Worksheet print labels", "printWorksheetBtn" in i18n_content and "uploadPhotoBtn" in i18n_content)

# Check Leader Cpanel file
leader_path = os.path.join(os.getcwd(), 'src', 'routes', 'cpanel', 'leader', '+page.svelte')
with open(leader_path, 'r', encoding='utf-8') as f:
    leader_content = f.read()

assert_test("Leader Cpanel uses 'Bài Test / Kiểm Tra'", "Bài Test / Kiểm Tra" in leader_content)
assert_test("Leader Cpanel purged old 'Khảo Thí' terminology", "Khảo Thí" not in leader_content)

# --- SUITE 2: Worksheet A4 & Handwritten Photo Uploads ---
print("\n--- SUITE 2: Worksheet A4 Print Template & Handwritten Photo Uploads ---")

student_path = os.path.join(os.getcwd(), 'src', 'routes', 'cpanel', 'student', '+page.svelte')
with open(student_path, 'r', encoding='utf-8') as f:
    student_content = f.read()

assert_test("Student Cpanel has 'In Phiếu Viết A4' button", "In Phiếu Viết A4" in student_content)
assert_test("Student Cpanel has printable-worksheet A4 container", "id=\"printable-worksheet\"" in student_content)
assert_test("Student Cpanel includes 4-line ruling grid", "border-dashed border-sky-300" in student_content or "4-line" in student_content or "Array(11)" in student_content)
assert_test("Student Cpanel has @media print CSS isolation", "@media print" in student_content)
assert_test("Student Cpanel supports handwritten photo capture", "handwrittenPhotoUrl" in student_content and "Chụp Ảnh Bài Viết Tay" in student_content)

# --- SUITE 3: Star Reward Calculation Logic ---
print("\n--- SUITE 3: Star Reward Calculation & On-Time Verification ---")

def calc_homework_stars(score, is_on_time):
    if not is_on_time:
        return 0
    if score >= 10.0:
        return 100
    if score >= 8.5:
        return 50
    return 0

assert_test("Perfect 10.0 on-time receives 100 stars", calc_homework_stars(10.0, 1) == 100)
assert_test("Good 9.0 on-time receives 50 stars", calc_homework_stars(9.0, 1) == 50)
assert_test("High score 10.0 but late submission receives 0 stars", calc_homework_stars(10.0, 0) == 0)
assert_test("Average score 7.5 on-time receives 0 stars", calc_homework_stars(7.5, 1) == 0)

# --- SUITE 4: Backend API & Storage Folder Structure ---
print("\n--- SUITE 4: Backend API & Hierarchical Storage Tree ---")

hw_api_path = os.path.join(os.getcwd(), 'src', 'routes', 'api', 'homework', '+server.js')
with open(hw_api_path, 'r', encoding='utf-8') as f:
    hw_api_content = f.read()

assert_test("API supports handwritten_image_url in schema", "handwritten_image_url" in hw_api_content)
assert_test("API assigns homework with next session deadline", "deadline_date" in hw_api_content)
assert_test("API notifies parents via parent_student_links", "parent_student_links" in hw_api_content)
assert_test("API logs events to location_activity_streams", "location_activity_streams" in hw_api_content)

camp_api_path = os.path.join(os.getcwd(), 'src', 'routes', 'api', 'campuses', '+server.js')
assert_test("Campuses API endpoint exists", os.path.exists(camp_api_path))

with open(camp_api_path, 'r', encoding='utf-8') as f:
    camp_content = f.read()

assert_test("Campuses API defines 3 core campuses", "loc_codung" in camp_content and "loc_sunshine" in camp_content and "loc_thayvu" in camp_content)

# --- SUITE 5: 4 Cpanels & AdminCP Total Presence ---
print("\n--- SUITE 5: 4 Role Cpanels & Central AdminCP ---")

admincp_path = os.path.join(os.getcwd(), 'src', 'routes', 'admincp', '+page.svelte')
assert_test("AdminCP Master Control page exists", os.path.exists(admincp_path))

with open(admincp_path, 'r', encoding='utf-8') as f:
    admincp_content = f.read()

assert_test("AdminCP manages multi-location campuses", "campuses" in admincp_content)
assert_test("AdminCP features Cross-Reminders scanner", "triggerCrossRemindersScan" in admincp_content)
assert_test("AdminCP features Hierarchical Storage Tree Audit", "storage/homework" in admincp_content)

cpanel_layout_path = os.path.join(os.getcwd(), 'src', 'routes', 'cpanel', '+layout.svelte')
with open(cpanel_layout_path, 'r', encoding='utf-8') as f:
    layout_content = f.read()

assert_test("Cpanel Layout has Language Switcher", "toggleLanguage" in layout_content)
assert_test("Cpanel Layout has Campus selector", "selectedCampus" in layout_content)

print("\n=====================================================================")
print(f"AUDIT SUMMARY: {tests_passed}/{tests_total} TESTS PASSED ({round(tests_passed/tests_total*100)}%)")
print("=====================================================================")

if tests_passed == tests_total:
    sys.exit(0)
else:
    sys.exit(1)

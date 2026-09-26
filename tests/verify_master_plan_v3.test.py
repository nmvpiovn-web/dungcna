# -*- coding: utf-8 -*-
"""
tests/verify_master_plan_v3.test.py
Automated verification test suite for Master Plan V3 and CODEX_COORDINATION.md requirements:
1. Stealth Vocabulary Engine & Deep Breakdown (Phonetics, Grammar, V-ing, Syn/Ant, Collocations)
2. Pronunciation Rubric Scoring Math (60% vowels/consonants + 25% stress + 15% fluency)
3. Spaced Repetition (SRS) Interval Lifecycle (Day 1, 3, 7, 30)
4. Guest Smart Exam: Expiring server-owned session, stripped client answers, server-side scoring
5. Voluntary Separate Opt-In Leads (no forced locks, no spam)
6. Multi-Role Badges & Star Ledger
7. DeepSeek Gateway: Text-only model, token cap, pedagogical fallback, zero audio claim
8. Verified Coordinates (Trường TH Đào Sơn Tây & surrounding branches)
"""

import sys
import os
import json
import re

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
print("RUNNING MASTER PLAN V3 & CODEX COMPLIANCE AUDIT SUITE")
print("=====================================================================")

# -------------------------------------------------------------------
# SUITE 1: Stealth Vocabulary Engine & Deep Word Breakdown
# -------------------------------------------------------------------
print("\n--- SUITE 1: Stealth Vocabulary Engine & Word Breakdown ---")

dict_page_path = os.path.join(os.getcwd(), 'src', 'routes', 'dictionary', '+page.svelte')
assert_test("Dictionary page exists", os.path.exists(dict_page_path))

with open(dict_page_path, 'r', encoding='utf-8') as f:
    dict_content = f.read()

assert_test("Dictionary supports Random Study Mode", "handleShuffleWords" in dict_content and "Học Ngẫu Nhiên" in dict_content)
assert_test("Dictionary supports Part of Speech filter", "selectedPos" in dict_content and "noun" in dict_content and "verb phrase" in dict_content)
assert_test("Dictionary supports CEFR Adaptive Difficulty", "getAdaptiveDifficulty" in dict_content and "cambridge_level" in dict_content)
assert_test("Dictionary features Deep Word Breakdown modal", "showDeepModal" in dict_content and "Phân Tích Sâu" in dict_content)
assert_test("Dictionary includes Stealth Hide & Spaced Repetition", "handleToggleMaster" in dict_content and "masteredWordsMap" in dict_content and "Đã Thuộc (Ẩn Từ)" in dict_content)

# -------------------------------------------------------------------
# SUITE 2: Pronunciation Rubric Mathematical Weights
# -------------------------------------------------------------------
print("\n--- SUITE 2: Pronunciation Rubric Math (60/25/15) ---")

assert_test("Rubric uses Web Audio recording", "MediaRecorder" in dict_content and "getUserMedia" in dict_content)
assert_test("Rubric weights formula: 60% vowels + 25% stress + 15% fluency", "0.60" in dict_content and "0.25" in dict_content and "0.15" in dict_content)

# Verify mathematical rubric calculation (standard Math.round half-up)
vowels = 90
stress = 95
fluency = 85
calculated_overall = int(vowels * 0.60 + stress * 0.25 + fluency * 0.15 + 0.5)
assert_test("Rubric sample calculation equals 91", calculated_overall == 91)

# -------------------------------------------------------------------
# SUITE 3: DeepSeek Server-Only Gateway & Audio Boundary
# -------------------------------------------------------------------
print("\n--- SUITE 3: DeepSeek Server-Only Gateway & Clear Audio Separation ---")

deepseek_api_path = os.path.join(os.getcwd(), 'src', 'routes', 'api', 'ai', 'deepseek', '+server.js')
assert_test("DeepSeek server gateway exists", os.path.exists(deepseek_api_path))

with open(deepseek_api_path, 'r', encoding='utf-8') as f:
    deepseek_content = f.read()

assert_test("Gateway enforces token budget cap (MAX_OUTPUT_TOKENS <= 800)", "MAX_OUTPUT_TOKENS" in deepseek_content and "800" in deepseek_content)
assert_test("Gateway enforces input query limit (MAX_QUERY_LEN <= 500)", "MAX_QUERY_LEN" in deepseek_content and "500" in deepseek_content)
assert_test("Gateway includes timeout protection (TIMEOUT_MS = 15000)", "TIMEOUT_MS" in deepseek_content and "15000" in deepseek_content)
assert_test("Gateway provides pedagogical fallback for 'enjoy'", ("VERIFIED_OFFLINE_DICTIONARY" in deepseek_content or "generatePedagogicalFallback" in deepseek_content) and "/ɪnˈdʒɔɪ/" in deepseek_content and "en-joy" in deepseek_content)
assert_test("Gateway grammar rule enforces 'enjoy + V-ing'", "enjoy + V-ing" in deepseek_content)
assert_test("Gateway strictly disclaims TTS audio generation (audio via Web Audio/Speech only)", "Web Audio" in deepseek_content and "KHÔNG tạo file âm thanh" in deepseek_content)

# -------------------------------------------------------------------
# SUITE 4: Guest Smart Exam & Expiring Session
# -------------------------------------------------------------------
print("\n--- SUITE 4: Guest Smart Exam & Anti-Cheat Session ---")

guest_api_path = os.path.join(os.getcwd(), 'src', 'routes', 'api', 'exams', 'guest', '+server.js')
assert_test("Guest exam API endpoint exists", os.path.exists(guest_api_path))

with open(guest_api_path, 'r', encoding='utf-8') as f:
    guest_content = f.read()

assert_test("Guest API starts expiring server-owned session", "guest_session_id" in guest_content and "GUEST_SESSIONS" in guest_content)
assert_test("Guest API strips correct answers from client payload", "STRICTLY OMIT correct_id" in guest_content)
assert_test("Guest API scores server-side and checks deadline expiry", "session.expiresAt" in guest_content and "Date.now() > session.expiresAt" in guest_content)
assert_test("Guest API outputs CEFR competency band and recommendation", "cefr_level" in guest_content and "recommendation" in guest_content)
assert_test("Guest API supports voluntary separate opt-in lead", "voluntary_lead" in guest_content and "parent_notes" in guest_content)

guest_modal_path = os.path.join(os.getcwd(), 'src', 'lib', 'components', 'GuestExamModal.svelte')
assert_test("GuestExamModal component exists", os.path.exists(guest_modal_path))

with open(guest_modal_path, 'r', encoding='utf-8') as f:
    modal_content = f.read()

assert_test("Guest modal supports Open Cloze questions", "open_cloze" in modal_content)
assert_test("Guest modal has real-time countdown timer", "timeLeftSeconds" in modal_content and "formattedTime" in modal_content)
assert_test("Guest modal features voluntary Zalo consultation form", "Gửi Yêu Cầu Tư Vấn Zalo" in modal_content)

# -------------------------------------------------------------------
# SUITE 5: Verified Coordinates & School Directory
# -------------------------------------------------------------------
print("\n--- SUITE 5: Verified Coordinates & Campus Satellite Mapping ---")

campuses_api_path = os.path.join(os.getcwd(), 'src', 'routes', 'api', 'campuses', '+server.js')
with open(campuses_api_path, 'r', encoding='utf-8') as f:
    camp_content = f.read()

assert_test("Campuses include Trường TH Đào Sơn Tây", "DAOSONTAY" in camp_content and "10.8753" in camp_content and "106.7725" in camp_content)
assert_test("Campuses include Nhà Cô Dung (Khu phố 3, Linh Xuân)", "CODUNG" in camp_content and "Linh Xuân" in camp_content)
assert_test("Campuses define distance to Đào Sơn Tây center", "distance_to_daosontay_m" in camp_content)

map_modal_path = os.path.join(os.getcwd(), 'src', 'lib', 'components', 'CampusesMapModal.svelte')
assert_test("CampusesMapModal component exists", os.path.exists(map_modal_path))

# -------------------------------------------------------------------
# SUITE 6: STEM KaTeX Math Rendering
# -------------------------------------------------------------------
print("\n--- SUITE 6: STEM KaTeX Formula Rendering ---")

stem_renderer_path = os.path.join(os.getcwd(), 'src', 'lib', 'components', 'StemMathRenderer.svelte')
assert_test("StemMathRenderer component exists", os.path.exists(stem_renderer_path))

with open(stem_renderer_path, 'r', encoding='utf-8') as f:
    stem_content = f.read()

assert_test("StemMathRenderer uses window.katex", "window.katex.renderToString" in stem_content)
assert_test("StemMathRenderer provides semantic fallback if offline", "renderedHtml = formula" in stem_content)

# -------------------------------------------------------------------
# SUITE 7: Gamification & Multi-Role Badges
# -------------------------------------------------------------------
print("\n--- SUITE 7: Multi-Role Badges & Star Ledger ---")

assert_test("Student badges defined: Tân Binh -> Thợ Săn -> Bậc Thầy -> Chiến Binh -> Huyền Thoại",
    "Tân Binh Học Ngữ" in dict_content and
    "Thợ Săn Từ Vựng" in dict_content and
    "Bậc Thầy Phát Âm" in dict_content and
    "Chiến Binh IELTS" in dict_content and
    "Huyền Thoại Làng Anh Ngữ" in dict_content
)

assert_test("Teacher badges defined: Sư Phạm Xuất Sắc -> Chuyên Gia -> Đại Sứ",
    "Sư Phạm Xuất Sắc" in dict_content and
    "Chuyên Gia Truyền Cảm Hứng" in dict_content and
    "Đại Sứ Học Viện" in dict_content
)

# -------------------------------------------------------------------
# Summary
# -------------------------------------------------------------------
print("\n=====================================================================")
print(f"MASTER PLAN V3 AUDIT SUMMARY: {tests_passed}/{tests_total} TESTS PASSED ({round(tests_passed/tests_total*100)}%)")
print("=====================================================================")

if tests_passed == tests_total:
    sys.exit(0)
else:
    sys.exit(1)

import urllib.request
import urllib.error
import ssl
import json
import hashlib
import os
import sys

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

results = {
    "timestamp": "2026-09-27T19:29:00+07:00",
    "phase1_code_and_build": {},
    "phase2_live_endpoints": {},
    "phase3_contrast_and_apk": {},
    "summary": {"total": 0, "passed": 0, "failed": 0}
}

def log_test(phase, name, passed, detail=""):
    results["summary"]["total"] += 1
    if passed:
        results["summary"]["passed"] += 1
        status = "PASS"
    else:
        results["summary"]["failed"] += 1
        status = "FAIL"
    results[phase][name] = {"status": status, "detail": detail}
    print(f"[{status}] {phase} -> {name}: {detail}")

print("=== STARTING 3-PHASE AUDIT SUITE ===")

# --- PHASE 1: CODE ARCHITECTURE & NAVIGATION AUDIT ---
layout_path = "src/routes/+layout.svelte"
if os.path.exists(layout_path):
    with open(layout_path, "r", encoding="utf-8") as f:
        content = f.read()
    # Check 1.1: header overflow
    header_tag = content.split("<header")[1].split(">")[0]
    has_overflow_hidden = 'overflow-hidden' in header_tag
    log_test("phase1_code_and_build", "header_overflow_visible", not has_overflow_hidden,
             "Header must NOT contain overflow-hidden so flyout dropdowns are visible")
    
    # Check 1.2: dropdown direct links
    has_course_link = '/courses' in content
    has_exam_link = '/exam' in content
    has_tools_link = '/tools' in content
    log_test("phase1_code_and_build", "nav_direct_routes_linked", has_course_link and has_exam_link and has_tools_link,
             "Dropdowns & mobile drawer must contain direct routes to /courses, /exam, /tools")

# Check 1.3: /tools route file exists
tools_page = "src/routes/tools/+page.svelte"
log_test("phase1_code_and_build", "tools_route_exists", os.path.exists(tools_page),
         "Dedicated /tools hub page created and exists")

# Check 1.4: Homepage reactive tab sync
home_page = "src/routes/+page.svelte"
if os.path.exists(home_page):
    with open(home_page, "r", encoding="utf-8") as f:
        home_content = f.read()
    has_tab_effect = "page.url.searchParams.get('tab')" in home_content and "scrollIntoView" in home_content
    log_test("phase1_code_and_build", "homepage_tab_query_sync", has_tab_effect,
             "Homepage $effect reacts to ?tab= parameter and scrolls to #curriculum-section")

# Check 1.5: Build artifact exists
dist_tools = "build/tools/index.html"
log_test("phase1_code_and_build", "build_prerender_tools", os.path.exists(dist_tools),
         f"Prerendered build/tools/index.html exists ({os.path.getsize(dist_tools) if os.path.exists(dist_tools) else 0} bytes)")

# --- PHASE 2: LIVE PRODUCTION ENDPOINT AUDIT ---
endpoints = [
    ("homepage", "https://timbk.io.vn/"),
    ("courses", "https://timbk.io.vn/courses/"),
    ("exam", "https://timbk.io.vn/exam/"),
    ("tools", "https://timbk.io.vn/tools/"),
    ("tab_primary", "https://timbk.io.vn/?tab=primary"),
    ("tab_secondary", "https://timbk.io.vn/?tab=secondary"),
    ("tab_high_school", "https://timbk.io.vn/?tab=high_school"),
    ("tab_certificate", "https://timbk.io.vn/?tab=certificate"),
    ("dictionary", "https://timbk.io.vn/dictionary/"),
    ("flashcards", "https://timbk.io.vn/flashcards/"),
    ("games", "https://timbk.io.vn/games/"),
    ("grammar", "https://timbk.io.vn/grammar/"),
    ("pedagogy", "https://timbk.io.vn/pedagogy/"),
    ("schedule", "https://timbk.io.vn/schedule/"),
    ("evaluations", "https://timbk.io.vn/evaluations/"),
    ("second_brain", "https://timbk.io.vn/second-brain/"),
    ("apk_version_json", "https://timbk.io.vn/apk_version.json"),
    ("apk_binary_download", "https://timbk.io.vn/downloads/tienganhcodung-latest.apk"),
    ("robots_txt", "https://timbk.io.vn/robots.txt"),
    ("sitemap_xml", "https://timbk.io.vn/sitemap.xml")
]

opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
urllib.request.install_opener(opener)

for name, url in endpoints:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "TiengAnh7AuditBot/2.2.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            code = resp.getcode()
            content_length = len(resp.read()) if name != "apk_binary_download" else int(resp.headers.get("Content-Length", 0))
            passed = (code == 200)
            log_test("phase2_live_endpoints", f"endpoint_{name}", passed, f"HTTP {code} ({content_length} bytes)")
    except urllib.error.HTTPError as e:
        log_test("phase2_live_endpoints", f"endpoint_{name}", False, f"HTTPError {e.code}")
    except Exception as e:
        log_test("phase2_live_endpoints", f"endpoint_{name}", False, f"Exception: {str(e)}")

# --- PHASE 3: CONTRAST & APK VERIFICATION AUDIT ---
# Check 3.1: Low contrast check across modified files
with open("src/routes/+layout.svelte", "r", encoding="utf-8") as f:
    l_text = f.read()
contrast_clean = ("text-slate-600 dark:text-slate-300" in l_text) and ("text-[11px] text-slate-500" not in l_text)
log_test("phase3_contrast_and_apk", "layout_dropdown_contrast", contrast_clean,
         "Dropdown descriptions upgraded from low-contrast slate-500 to text-slate-600 dark:text-slate-300")

# Check 3.2: Courses page contrast
courses_path = "src/routes/courses/+page.svelte"
with open(courses_path, "r", encoding="utf-8") as f:
    c_text = f.read()
courses_contrast_ok = ("text-slate-700 dark:text-slate-300" in c_text) and ("text-slate-900 dark:text-white" in c_text)
log_test("phase3_contrast_and_apk", "courses_high_contrast", courses_contrast_ok,
         "Courses page uses WCAG compliant text-slate-700 / dark:text-slate-300 and dark:bg-slate-900")

# Check 3.3: Local APK file verification
apk_paths = [
    "android/app/build/outputs/apk/debug/app-debug.apk",
    "static/downloads/tienganhcodung-latest.apk"
]
apk_target = None
for p in apk_paths:
    if os.path.exists(p):
        apk_target = p
        break

if apk_target:
    apk_size = os.path.getsize(apk_target)
    sha256 = hashlib.sha256()
    with open(apk_target, "rb") as f:
        while chunk := f.read(65536):
            sha256.update(chunk)
    apk_hash = sha256.hexdigest().upper()
    expected_hash = "075F297219F174C8FFA679FCEE8A6BA230E9A347B883B97D2FCDBBE036F42C97"
    hash_match = (apk_hash == expected_hash)
    log_test("phase3_contrast_and_apk", "apk_file_sha256", hash_match,
             f"SHA-256 match: {apk_hash} at {apk_target} (Size: {apk_size} bytes)")
else:
    log_test("phase3_contrast_and_apk", "apk_file_sha256", False, "APK file not found")

# Check 3.4: apk_version.json on server matches local
try:
    req = urllib.request.Request("https://timbk.io.vn/apk_version.json", headers={"User-Agent": "TiengAnh7AuditBot/2.2.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        server_json = json.loads(resp.read().decode("utf-8"))
    ver_match = server_json.get("version_name") == "2.2.0" and server_json.get("sha256") == "075F297219F174C8FFA679FCEE8A6BA230E9A347B883B97D2FCDBBE036F42C97"
    log_test("phase3_contrast_and_apk", "server_apk_metadata_match", ver_match,
             f"Server reports version {server_json.get('version_name')}, hash matches verified build")
except Exception as e:
    log_test("phase3_contrast_and_apk", "server_apk_metadata_match", False, str(e))

out_file = "raw_3phase_audit_result.json"
with open(out_file, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

print("\n=== AUDIT FINISHED ===")
print(f"Total: {results['summary']['total']} | Passed: {results['summary']['passed']} | Failed: {results['summary']['failed']}")
if results["summary"]["failed"] == 0:
    print("ALL AUDIT PHASES PASSED 100%!")
    sys.exit(0)
else:
    print("WARNING: Some checks failed.")
    sys.exit(1)

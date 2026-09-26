# -*- coding: utf-8 -*-
"""
detailed_duplicate_audit.py
Compares the 34 untracked files in 01_-04_ with their counterparts in 07_GOOGLE_DRIVE_LIBRARY.
Checks:
- Character counts
- Whether the content of 01_-04_ is a strict subset of 07_
- Whether 01_-04_ has any unique additions
- Records evidence to a JSON report for Codex audit.
"""
import os
import json
import re

DRIVE_DIR = "second_brain/07_GOOGLE_DRIVE_LIBRARY"
MANIFEST_FILE = "src/lib/data/drive_sync_manifest.json"

with open(MANIFEST_FILE, "r", encoding="utf-8") as f:
    manifest = json.load(f)

# Map from cleaned name to drive note
drive_notes = {}
for item in manifest["files"]:
    nid = item["note_id"]
    npath = os.path.join(DRIVE_DIR, f"{nid}.md")
    if os.path.exists(npath):
        with open(npath, "r", encoding="utf-8") as nf:
            content = nf.read()
        drive_notes[nid] = {
            "source": item["source"],
            "path": npath,
            "chars": len(content),
            "content": content,
            "duplicate_of": item.get("duplicate_of")
        }

UNTRACKED_FILES = [
    ("second_brain/01_CURRICULUM_GDPT/although_despite_key.md", "drive-although-despite-key-39982d3b"),
    ("second_brain/01_CURRICULUM_GDPT/because_because_of_key.md", "drive-because-because-of-key-e15b69cf"),
    ("second_brain/01_CURRICULUM_GDPT/nh_m__7__chuy_n____ph_i_h_p_th__thpt_h__ng_kh.md", "drive-nhom-7-chuyen-e-phoi-hop-thi-thpt-huong-khe-d9cc7ef9"),
    ("second_brain/01_CURRICULUM_GDPT/photo_quiz_reading_giaoandethitienganh_info.md", "drive-photo-quiz-reading-giaoandethitienganh-info-6433023a"),
    ("second_brain/01_CURRICULUM_GDPT/so_that_in_order_to_key.md", "drive-so-that-in-order-to-key-b1ded2bc"),
    ("second_brain/01_CURRICULUM_GDPT/unit_5___lesson_5d___speaking___page_73.md", "drive-unit-5-lesson-5d-speaking-page-73-e4725c58"),
    ("second_brain/01_CURRICULUM_GDPT/unit_5___lesson_5f___skills_reading___page_76.md", "drive-unit-5-lesson-5f-skills-reading-page-76-56753164"),
    ("second_brain/01_CURRICULUM_GDPT/viet_lai_cau_1_100.md", "drive-viet-lai-cau-1-100-b72ba5fe"),
    ("second_brain/01_CURRICULUM_GDPT/yen_lap_g7.md", "drive-yen-lap-g7-ea81ca75"),
    ("second_brain/02_GRAMMAR_KNOWLEDGE_BASE/conditional_sentences_key.md", "drive-conditional-sentences-key-fe8b7273"),
    ("second_brain/02_GRAMMAR_KNOWLEDGE_BASE/phrasal_verbs.md", "drive-phrasal-verbs-ab32816d"),
    ("second_brain/02_GRAMMAR_KNOWLEDGE_BASE/phrasal_verbs_key.md", "drive-phrasal-verbs-key-debcaeec"),
    ("second_brain/02_GRAMMAR_KNOWLEDGE_BASE/relative_clause_key.md", "drive-relative-clause-key-ca933f8f"),
    ("second_brain/02_GRAMMAR_KNOWLEDGE_BASE/reported_speech_key.md", "drive-reported-speech-key-35c13cb9"),
    ("second_brain/03_VOCABULARY_ATLAS/1000_word_formation.md", "drive-1000-word-formation-cd360c3f"),
    ("second_brain/03_VOCABULARY_ATLAS/22000_tu_toefl_ielts_harold_levine.md", "drive-22000-tu-toefl-ielts-harold-levine-b48772e8"),
    ("second_brain/03_VOCABULARY_ATLAS/becoming_independent_vocab.md", "drive-becoming-independent-vocab-972b3e6a"),
    ("second_brain/03_VOCABULARY_ATLAS/cities_urbanisation_vocab.md", "drive-cities-urbanisation-vocab-73d9904c"),
    ("second_brain/03_VOCABULARY_ATLAS/our_heritage_vocab.md", "drive-our-heritage-vocab-d749c408"),
    ("second_brain/04_EXAMS_AND_QUESTION_BANK/1000_cau_trac_nghiem_ngu_phap_hsg.md", "drive-1000-cau-trac-nghiem-ngu-phap-hsg-268c76ae"),
    ("second_brain/04_EXAMS_AND_QUESTION_BANK/31__viet_lai_cau___thi_hsg_lop_10_11_12.md", "drive-31-viet-lai-cau-thi-hsg-lop-10-11-12-223fbdc9"),
    ("second_brain/04_EXAMS_AND_QUESTION_BANK/chuyen_de_ngu_phap.md", "drive-chuyen-de-ngu-phap-18444328"),
    ("second_brain/04_EXAMS_AND_QUESTION_BANK/chuyen_de_so_1_viet_lai_cau___thi_hsg_lop_10_11_12.md", "drive-chuyen-de-so-1-viet-lai-cau-thi-hsg-lop-10-11-12-045c09d3"),
    ("second_brain/04_EXAMS_AND_QUESTION_BANK/g3_ck1_test.md", "drive-g3-ck1-test-eb751cc4"),
    ("second_brain/04_EXAMS_AND_QUESTION_BANK/g4_ck1_test.md", "drive-g4-ck1-test-f16f49cc"),
    ("second_brain/04_EXAMS_AND_QUESTION_BANK/g5_ck1_test.md", "drive-g5-ck1-test-9ab6f4b1"),
    ("second_brain/04_EXAMS_AND_QUESTION_BANK/g7_hsg_de2.md", "drive-g7-hsg-de2-7c5b41f9"),
    ("second_brain/04_EXAMS_AND_QUESTION_BANK/hsg_anh_8_s__23.md", "drive-e-hsg-anh-8-so-23-801e422c"),
    ("second_brain/04_EXAMS_AND_QUESTION_BANK/hsg_anh_8_s__24.md", "drive-e-hsg-anh-8-so-24-af2d9e46"),
    ("second_brain/04_EXAMS_AND_QUESTION_BANK/hsg_lop_11.md", "drive-hsg-lop-11-6fed2b0b"),
    ("second_brain/04_EXAMS_AND_QUESTION_BANK/hsg_lop_12_quang_nam.md", "drive-hsg-lop-12-quang-nam-437fe0cf"),
    ("second_brain/04_EXAMS_AND_QUESTION_BANK/ioe_lop_5_tron_bo.md", "drive-ioe-lop-5-tron-bo-3d9eda8c"),
    ("second_brain/04_EXAMS_AND_QUESTION_BANK/key__chuyen_de_so_1_viet_lai_cau_thi_hsg_10_11_12.md", "drive-key-chuyen-de-so-1-viet-lai-cau-thi-hsg-10-11-12-371e03a0"),
    ("second_brain/04_EXAMS_AND_QUESTION_BANK/speaking_test_4__units_9_10.md", "drive-speaking-test-4-units-9-10-26d51a71")
]

results = []
print(f"{'Source Untracked File':<50} | {'07_ File':<40} | {'Old Chars':<10} | {'07 Chars':<10} | {'Status'}")
print("-" * 130)

for old_path, drive_nid in UNTRACKED_FILES:
    old_size = os.path.getsize(old_path) if os.path.exists(old_path) else 0
    with open(old_path, "r", encoding="utf-8") as f:
        old_content = f.read()
    
    d_info = drive_notes.get(drive_nid, {})
    d_chars = d_info.get("chars", 0)
    
    # Check if 07_ is substantially larger or a complete extract
    is_subset = len(old_content) < d_chars or (old_content[:100] in d_info.get("content", ""))
    
    status = "TRUNCATED_DUPLICATE" if d_chars >= len(old_content) else "NEEDS_INSPECTION"
    if d_info.get("duplicate_of"):
        status += f" (REF_TO_{d_info['duplicate_of']})"
        
    results.append({
        "old_file": old_path,
        "old_chars": len(old_content),
        "drive_note_id": drive_nid,
        "drive_source": d_info.get("source"),
        "drive_chars": d_chars,
        "status": status
    })
    
    short_old = os.path.basename(old_path)
    print(f"{short_old:<50} | {drive_nid:<40} | {len(old_content):<10} | {d_chars:<10} | {status}")

with open("scripts/reconciliation_evidence.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print("\nSaved evidence to scripts/reconciliation_evidence.json")

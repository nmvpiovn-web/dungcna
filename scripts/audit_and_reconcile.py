# -*- coding: utf-8 -*-
"""
audit_and_reconcile.py
1. Audits untracked files in obsidian_vault and second_brain (01_ to 04_).
2. Compares them against 07_GOOGLE_DRIVE_LIBRARY (the Single Source of Truth from 35 Drive sources).
3. Identifies duplicates, links, backlinks, and extra content.
4. Generates a clear reconciliation report.
"""
import os
import re
import hashlib
import json

def get_text_content(path):
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        return f.read()

def clean_text_for_comparison(text):
    # Strip frontmatter and normalize whitespace
    text = re.sub(r'^---[\s\S]*?---\n', '', text)
    return ''.join(text.split())

def audit_vault(vault_dir):
    print(f"\n=======================================================")
    print(f"AUDITING: {vault_dir}")
    print(f"=======================================================")
    gdrive_dir = os.path.join(vault_dir, "07_GOOGLE_DRIVE_LIBRARY")
    gdrive_files = {}
    if os.path.exists(gdrive_dir):
        for fname in os.listdir(gdrive_dir):
            if fname.endswith(".md"):
                fpath = os.path.join(gdrive_dir, fname)
                content = get_text_content(fpath)
                norm = clean_text_for_comparison(content)
                gdrive_files[fname] = {
                    "path": fpath,
                    "size": os.path.getsize(fpath),
                    "norm": norm,
                    "sample": norm[:100]
                }
    print(f"Total files in 07_GOOGLE_DRIVE_LIBRARY: {len(gdrive_files)}")

    # Check 01_ to 04_
    untracked_dirs = [
        "01_CURRICULUM_GDPT",
        "02_GRAMMAR_KNOWLEDGE_BASE",
        "03_VOCABULARY_ATLAS",
        "04_EXAMS_AND_QUESTION_BANK"
    ]

    reconciled = []
    
    for d in untracked_dirs:
        full_d = os.path.join(vault_dir, d)
        if not os.path.exists(full_d):
            continue
        for fname in sorted(os.listdir(full_d)):
            if not fname.endswith(".md"):
                continue
            fpath = os.path.join(full_d, fname)
            content = get_text_content(fpath)
            norm = clean_text_for_comparison(content)
            
            # Find best match in 07_
            matched = None
            for gname, gdata in gdrive_files.items():
                if gname == "00_GOOGLE_DRIVE_INDEX.md":
                    continue
                # check if base name matches or content matches
                base_clean = fname.replace('.md', '').replace('_', '-')
                gname_clean = re.sub(r'-[0-9a-f]{8}\.md$', '', gname).replace('drive-', '')
                
                # Check text similarity / containment
                if norm and gdata["norm"] and (norm in gdata["norm"] or gdata["norm"] in norm or base_clean in gname_clean or gname_clean in base_clean):
                    matched = gname
                    break
            
            reconciled.append({
                "source_file": os.path.join(d, fname),
                "size": os.path.getsize(fpath),
                "matched_in_07": matched
            })

    print(f"Scanned {len(reconciled)} files in 01_ - 04_:")
    matches_count = 0
    for r in reconciled:
        print(f" - {r['source_file']} ({r['size']} bytes) -> Matched in 07: {r['matched_in_07']}")
        if r['matched_in_07']:
            matches_count += 1
    print(f"Total matched: {matches_count}/{len(reconciled)}")
    return reconciled

if __name__ == "__main__":
    audit_vault("obsidian_vault")
    audit_vault("second_brain")

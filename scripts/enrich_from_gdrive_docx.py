import os
import re
import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

WORKSPACE = Path(r"c:\Users\admin\.gemini\antigravity\scratch\tienganh7-sveltekit")
GDRIVE_DIR = WORKSPACE / "data" / "gdrive_downloads"
SECOND_BRAIN_DIR = WORKSPACE / "second_brain"
OBSIDIAN_VAULT_DIR = WORKSPACE / "obsidian_vault"
TEACHING_RESOURCES_PATH = WORKSPACE / "src" / "lib" / "data" / "teaching_resources.json"

def extract_text_from_docx(file_path):
    try:
        with zipfile.ZipFile(file_path) as z:
            xml_content = z.read("word/document.xml")
            tree = ET.fromstring(xml_content)
            # Find all w:p (paragraphs) and within them w:t (text)
            namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            paragraphs = []
            for p in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
                texts = [node.text for node in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if node.text]
                if texts:
                    paragraphs.append(''.join(texts).strip())
            return paragraphs
    except Exception as e:
        print(f"Error reading {file_path.name}: {e}")
        return []

def classify_doc(filename, sample_text):
    lower_fn = filename.lower()
    combined = (lower_fn + " " + " ".join(sample_text[:10])).lower()
    
    if any(k in combined for k in ["hsg", "de thi", "test", "ck1", "ioe", "speaking test"]):
        category = "exams"
        grade_level = "all"
        if "g3" in lower_fn or "lop 3" in combined: grade_level = "primary_3"
        elif "g4" in lower_fn or "lop 4" in combined: grade_level = "primary_4"
        elif "g5" in lower_fn or "lop 5" in combined: grade_level = "primary_5"
        elif "g6" in lower_fn or "lop 6" in combined: grade_level = "secondary_6"
        elif "g7" in lower_fn or "lop 7" in combined: grade_level = "secondary_7"
        elif "lop 8" in lower_fn or "anh 8" in combined: grade_level = "secondary_8"
        elif "lop 11" in lower_fn or "lop 11" in combined: grade_level = "highschool_11"
        elif "lop 12" in lower_fn or "lop 12" in combined: grade_level = "highschool_12"
        return "exams", "04_EXAMS_AND_QUESTION_BANK", grade_level
        
    elif any(k in combined for k in ["vocab", "tu vung", "word formation", "22000"]):
        category = "vocabulary"
        grade_level = "all"
        if "toefl" in combined or "ielts" in combined: grade_level = "ielts_toeic"
        return "vocabulary", "03_VOCABULARY_ATLAS", grade_level
        
    elif any(k in combined for k in ["ngu phap", "grammar", "phrasal", "clause", "speech", "conditional", "viet lai cau", "thoi hoa", "chuyen de"]):
        category = "grammar"
        grade_level = "all"
        if "10_11_12" in lower_fn or "thpt" in combined: grade_level = "highschool"
        return "grammar", "02_GRAMMAR_KNOWLEDGE_BASE", grade_level
        
    else:
        return "curriculum", "01_CURRICULUM_GDPT", "all"

def format_title(filename):
    clean = filename.replace(".docx", "").replace(".doc", "").replace("_", " ").strip()
    clean = re.sub(r'^[0-9]+\.\s*', '', clean)
    clean = re.sub(r'\s+', ' ', clean)
    return clean.title()

def main():
    print(f"Scanning GDrive DOCX files in: {GDRIVE_DIR}")
    files = [f for f in GDRIVE_DIR.glob("*.*") if f.suffix.lower() in [".docx", ".doc"]]
    print(f"Found {len(files)} files.")

    # Load existing teaching resources
    existing_resources = []
    if TEACHING_RESOURCES_PATH.exists():
        try:
            with open(TEACHING_RESOURCES_PATH, "r", encoding="utf-8") as f:
                existing_resources = json.load(f)
        except Exception:
            existing_resources = []

    existing_ids = {r["id"] for r in existing_resources}
    new_resources = list(existing_resources)
    added_count = 0

    index_links = {
        "01_CURRICULUM_GDPT": [],
        "02_GRAMMAR_KNOWLEDGE_BASE": [],
        "03_VOCABULARY_ATLAS": [],
        "04_EXAMS_AND_QUESTION_BANK": []
    }

    for file_path in sorted(files, key=lambda p: p.name):
        paragraphs = extract_text_from_docx(file_path)
        if not paragraphs:
            continue

        raw_name = file_path.name
        slug = re.sub(r'[^a-zA-Z0-9_]', '_', file_path.stem.lower()).strip('_')
        doc_id = f"res_gdrive_{slug[:32]}"
        title = format_title(raw_name)
        cat_key, vault_folder, grade_level = classify_doc(raw_name, paragraphs)

        # Generate rich markdown content
        summary_preview = "\n\n".join(paragraphs[:35])
        if len(paragraphs) > 35:
            summary_preview += f"\n\n*(Còn tiếp {len(paragraphs) - 35} đoạn / câu hỏi trong file gốc)*"

        md_content = f"""---
title: "{title}"
aliases: ["{title}", "{file_path.stem}"]
tags: ["second-brain", "{cat_key}", "{grade_level}", "hoc-lieu-chuan"]
category: "{cat_key}"
grade_level: "{grade_level}"
source: "Google Drive Extracted Archive"
total_paragraphs: {len(paragraphs)}
---

# 📚 {title}

> [!NOTE] Thông Tin Tài Liệu
> - **Chuyên mục:** `[[{vault_folder}]]`
> - **Phân loại cấp học:** `{grade_level.upper()}`
> - **Nguồn:** Học liệu ôn thi Tiếng Anh GDPT & Đội tuyển HSG Cô Dung

## 🎯 Nội Dung & Bài Tập Chọn Lọc

{summary_preview}

## 🔗 Liên Kết Mạng Nơ-ron Tri Thức (WikiLinks)
- [[00_INDEX_MOC|Bản Đồ MOC Tổng Quan]]
- [[02_GRAMMAR_KNOWLEDGE_BASE/14_CHUYEN_DE_NGU_PHAP_TRONG_TAM_2026|14 Chuyên Đề Ngữ Pháp Cốt Lõi]]
- [[04_EXAMS_AND_QUESTION_BANK/MA_TRAN_DE_THI_12_KHOI_2026|Ma Trận Đề Thi 12 Khối Lớp]]
"""

        # Write to both second_brain and obsidian_vault
        for base_vault in [SECOND_BRAIN_DIR, OBSIDIAN_VAULT_DIR]:
            target_dir = base_vault / vault_folder
            target_dir.mkdir(parents=True, exist_ok=True)
            note_path = target_dir / f"{slug}.md"
            with open(note_path, "w", encoding="utf-8") as nf:
                nf.write(md_content)

        index_links.get(vault_folder, []).append(f"- [[{vault_folder}/{slug}|{title}]] ({grade_level.upper()})")

        # Add to teaching_resources.json if not already present
        if doc_id not in existing_ids:
            new_resources.append({
                "id": doc_id,
                "category": cat_key,
                "grade_level": grade_level,
                "title": title,
                "content_markdown": summary_preview[:4000],
                "native_teacher_tips": f"Ôn tập chuyên đề {title} kết hợp giải thích cấu trúc và cho học sinh đặt câu phản xạ 3 lần.",
                "keywords": f"{title.lower()}, {slug.replace('_', ' ')}, {cat_key}, {grade_level}, hoc lieu co dung",
                "downloads_url": f"https://tienganh7-pro.pages.dev/data/gdrive_downloads/{raw_name}",
                "created_at": "2026-09-25 14:35:00"
            })
            existing_ids.add(doc_id)
            added_count += 1

    # Save updated teaching_resources.json
    with open(TEACHING_RESOURCES_PATH, "w", encoding="utf-8") as f:
        json.dump(new_resources, f, ensure_ascii=False, indent=2)

    # Append links to 00_INDEX_MOC.md in both vaults
    for base_vault in [SECOND_BRAIN_DIR, OBSIDIAN_VAULT_DIR]:
        moc_path = base_vault / "00_INDEX_MOC.md"
        if moc_path.exists():
            with open(moc_path, "r", encoding="utf-8") as f:
                moc_text = f.read()

            addition = "\n\n## 📥 Kho 35 Tài Liệu Giáo Án & Đề Thi Mới Đồng Bộ (Google Drive)\n"
            for k, links in index_links.items():
                if links:
                    addition += f"\n### {k}\n" + "\n".join(links) + "\n"

            if "Kho 35 Tài Liệu Giáo Án & Đề Thi Mới Đồng Bộ" not in moc_text:
                with open(moc_path, "a", encoding="utf-8") as f:
                    f.write(addition)

    print(f"Enrichment completed! Added {added_count} resources to teaching_resources.json (Total now: {len(new_resources)}).")
    print(f"Generated Obsidian markdown notes in second_brain/ and obsidian_vault/ with full WikiLinks [[...]].")

if __name__ == "__main__":
    main()

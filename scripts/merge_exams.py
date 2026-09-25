import json
import sqlite3
import subprocess

# 1. Get original exams from git HEAD
orig_exams_raw = subprocess.check_output(['git', 'show', 'HEAD:src/lib/data/exams.json'], encoding='utf-8')
orig_exams = json.loads(orig_exams_raw)

# 2. Get current exams
with open('src/lib/data/exams.json', 'r', encoding='utf-8') as f:
    current_exams = json.load(f)

exam_map = {e['id']: e for e in orig_exams}
for e in current_exams:
    exam_map[e['id']] = e

merged_exams = list(exam_map.values())

with open('src/lib/data/exams.json', 'w', encoding='utf-8') as f:
    json.dump(merged_exams, f, ensure_ascii=False, indent=2)

print(f"Total merged exams: {len(merged_exams)}")

# Sync to SQLite exams table
conn = sqlite3.connect('data/tienganh7.db')
cur = conn.cursor()
cur.execute('DELETE FROM exams;')
for e in merged_exams:
    cur.execute('''
    INSERT OR REPLACE INTO exams (
        id, curriculum_id, title, description, grade, format_type, skill_category, duration_minutes, total_questions, pass_percentage, created_by, is_published, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        e['id'], e['curriculum_id'], e['title'], e['description'], e.get('grade', 0),
        e['format_type'], e['skill_category'], e['duration_minutes'], e['total_questions'],
        e['pass_percentage'], e.get('created_by'), e.get('is_published', 1), e.get('created_at')
    ))
conn.commit()
conn.close()
print("Updated exams table in SQLite database.")

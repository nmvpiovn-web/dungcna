import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

exams = json.load(open('src/lib/data/exams.json', encoding='utf-8'))
questions = json.load(open('src/lib/data/questions.json', encoding='utf-8'))

print(f"Total exams: {len(exams)}")
print(f"Total questions: {len(questions)}")

# Categorize exams by grade and duration
grade_buckets = {g: {'5m': [], '15m': [], '45m': [], 'other': []} for g in range(1, 13)}
grade_buckets[0] = {'5m': [], '15m': [], '45m': [], 'other': []} # for Cambridge/IELTS

for e in exams:
    gr = e.get('grade', 0)
    dur = e.get('duration_minutes', 0)
    if gr not in grade_buckets:
        grade_buckets[gr] = {'5m': [], '15m': [], '45m': [], 'other': []}
    
    if dur == 5:
        grade_buckets[gr]['5m'].append(e['id'])
    elif dur == 15:
        grade_buckets[gr]['15m'].append(e['id'])
    elif dur == 45:
        grade_buckets[gr]['45m'].append(e['id'])
    else:
        grade_buckets[gr]['other'].append((e['id'], dur))

print("\n=== EXAM DISTRIBUTION MATRIX ===")
print(f"{'Grade':<15} | {'5m (5 phút)':<12} | {'15m (15 phút)':<14} | {'45m (45 phút)':<14} | {'Other Durations'}")
print("-" * 75)

for gr in sorted(grade_buckets.keys()):
    label = f"Lớp {gr}" if gr > 0 else "Quốc Tế (IELTS/KET)"
    c5 = len(grade_buckets[gr]['5m'])
    c15 = len(grade_buckets[gr]['15m'])
    c45 = len(grade_buckets[gr]['45m'])
    other = len(grade_buckets[gr]['other'])
    status = "✅ ĐỦ BỘ 3" if (c5 > 0 and c15 > 0 and c45 > 0) else "❌ THIẾU"
    print(f"{label:<15} | {c5:<12} | {c15:<14} | {c45:<14} | {other:<10} => {status}")

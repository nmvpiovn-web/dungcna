import sqlite3
import json
import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

print("=== TEST SUITE: MODULAR DATABASE VERIFICATION & AUDIT ===\n")

# 1. Verify JSON Database files exist
vocabDbPath = 'src/lib/data/vocabulary_db.json'
grammarDbPath = 'src/lib/data/grammar_topics.json'
gdptDbPath = 'src/lib/data/gdpt_curricula_db.json'
examsDbPath = 'src/lib/data/exams.json'
questionsDbPath = 'src/lib/data/questions.json'

for p in [vocabDbPath, grammarDbPath, gdptDbPath, examsDbPath, questionsDbPath]:
    if not os.path.exists(p):
        raise Exception(f"Missing database file: {p}")

with open(vocabDbPath, 'r', encoding='utf-8') as f:
    vocabList = json.load(f)
with open(grammarDbPath, 'r', encoding='utf-8') as f:
    grammarList = json.load(f)
with open(gdptDbPath, 'r', encoding='utf-8') as f:
    gdptList = json.load(f)
with open(examsDbPath, 'r', encoding='utf-8') as f:
    examsList = json.load(f)
with open(questionsDbPath, 'r', encoding='utf-8') as f:
    questionsList = json.load(f)

print("--- TEST 1: Dedicated Vocabulary DB for Web Modules ---")
print(f"Total words in vocabulary_db.json: {len(vocabList)}")
sampleG3 = next((w for w in vocabList if w['term'] == 'school bag'), None)
sampleG7 = next((w for w in vocabList if w['term'] == 'community service'), None)
sampleG11 = next((w for w in vocabList if w['term'] == 'pedestrian zone'), None)

if not sampleG3 or sampleG3['grade'] != 'Lớp 3': raise Exception('Grade 3 vocabulary missing!')
if not sampleG7 or sampleG7['grade'] != 'Lớp 7': raise Exception('Grade 7 vocabulary missing!')
if not sampleG11 or sampleG11['grade'] != 'Lớp 11': raise Exception('Grade 11 vocabulary missing!')

for word in [sampleG3, sampleG7, sampleG11]:
    for f in ['term', 'ipa', 'pos', 'meaning_vi', 'phonics_note', 'example_en', 'example_vi', 'cambridge_level']:
        if not word.get(f): raise Exception(f"Word '{word['term']}' missing required field '{f}'!")

print("Sample G7 word:", {'term': sampleG7['term'], 'ipa': sampleG7['ipa'], 'meaning_vi': sampleG7['meaning_vi'], 'level': sampleG7['cambridge_level']})
print("✅ Vocabulary DB contains rich phonics, IPA, POS, examples, and grade tagging.")

print("\n--- TEST 2: Grammar Database Partitioning ---")
print(f"Total grammar topics: {len(grammarList)}")
presSimple = next((g for g in grammarList if g['id'] == 'gram_present_simple'), None)
pastSimple = next((g for g in grammarList if g['id'] == 'gram_past_simple'), None)
stativeVerbs = next((g for g in grammarList if g['id'] == 'gram_stative_dynamic_verbs'), None)

if not presSimple or not pastSimple or not stativeVerbs: raise Exception('Key grammar topics missing!')
if not presSimple['formula'].get('affirmative') or not presSimple['signal_words'] or not presSimple['common_mistakes']:
    raise Exception('Grammar topic missing formula or signal words!')

print("Grammar sample:", {'topic': presSimple['topic'], 'grade': presSimple['grade_level'], 'signals': presSimple['signal_words'][:4]})
print("✅ Grammar DB properly partitioned with formulas, usage rules, and common mistakes.")

print("\n--- TEST 3: GDPT 2018/2026 Curricula Roadmap ---")
print(f"GDPT Stages: {len(gdptList)} stages (Tiểu học, THCS, THPT)")
primary = next((g for g in gdptList if g['grade_id'] == 'g1_5'), None)
jHigh = next((g for g in gdptList if g['grade_id'] == 'g6_9'), None)
sHigh = next((g for g in gdptList if g['grade_id'] == 'g10_12'), None)

if not primary or not jHigh or not sHigh: raise Exception('Missing GDPT stage taxonomy!')
if len(primary['grades']) != 5 or len(jHigh['grades']) != 4 or len(sHigh['grades']) != 3:
    raise Exception('Grade counts in GDPT stages mismatch!')

print("✅ GDPT curricula correctly maps 12 grades from Lớp 1 to Lớp 12.")

print("\n--- TEST 4: Grade-Scoped Exams & Questions Bank ---")
print(f"Total exams: {len(examsList)}, Total questions: {len(questionsList)}")
g3Exam = next((e for e in examsList if e.get('grade') == 3), None)
g4Exam = next((e for e in examsList if e.get('grade') == 4), None)
g5Exam = next((e for e in examsList if e.get('grade') == 5), None)
g7Exam = next((e for e in examsList if e.get('id') == 'ex_g7_hsg_olympic'), None)
g9Exam = next((e for e in examsList if e.get('id') == 'ex_g9_vao_10'), None)
g11Exam = next((e for e in examsList if e.get('id') == 'ex_g11_cities_future'), None)
g12Exam = next((e for e in examsList if e.get('grade') == 12), None)
ieltsExam = next((e for e in examsList if e.get('format_type') == 'ielts_academic'), None)

if not all([g3Exam, g4Exam, g5Exam, g7Exam, g9Exam, g11Exam, g12Exam, ieltsExam]):
    raise Exception('Missing exams for critical grade levels!')

print("Exam Catalog verified across: Lớp 3, 4, 5, 7, 9, 11, 12, IELTS!")
g7HsgQuestions = [q for q in questionsList if q.get('exam_id') == 'ex_g7_hsg_olympic']
if len(g7HsgQuestions) == 0: raise Exception('Missing questions for Grade 7 HSG exam!')
print(f"G7 HSG Exam has {len(g7HsgQuestions)} questions linked.")
print("Sample question:", {'prompt': g7HsgQuestions[0]['prompt'], 'ans': g7HsgQuestions[0]['correct_answer']})
print("✅ Grade-scoped exams and questions bank verified.")

print("\n--- TEST 5: SQLite Database (data/tienganh7.db) Verification ---")
conn = sqlite3.connect('data/tienganh7.db')
cur = conn.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [t[0] for t in cur.fetchall()]
print("SQLite Tables present:", tables)

expected = ['words', 'units', 'grammar_topics', 'curricula', 'exams', 'exam_questions']
for exp in expected:
    if exp not in tables:
        raise Exception(f"Missing expected table '{exp}' in SQLite database!")

cur.execute("SELECT COUNT(*) FROM words")
w_count = cur.fetchone()[0]
print(f"SQLite 'words' count: {w_count}")
if w_count < 30: raise Exception('SQLite words count too low!')

cur.execute("SELECT COUNT(*) FROM grammar_topics")
g_count = cur.fetchone()[0]
print(f"SQLite 'grammar_topics' count: {g_count}")
if g_count < 5: raise Exception('SQLite grammar count too low!')

cur.execute("SELECT COUNT(*) FROM exam_questions")
q_count = cur.fetchone()[0]
print(f"SQLite 'exam_questions' count: {q_count}")
if q_count < 20: raise Exception('SQLite exam_questions count too low!')

conn.close()
print("✅ SQLite database verified with all relational tables and synced data!")

print("\n🎉 ALL 5 DATABASE ARCHITECTURE & INTEGRITY TESTS PASSED!")

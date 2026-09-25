import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

data = json.load(open('scripts/categorized_gdrive_files.json', 'r', encoding='utf-8'))
for cat, items in data.items():
    print(f"=== {cat} ({len(items)}) ===")
    for it in items[:6]:
        sz = int(it.get('size', 0)) // 1024
        print(f"  - {it['name']} ({sz} KB)")

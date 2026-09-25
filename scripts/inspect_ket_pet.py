import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
data = json.load(open('scripts/categorized_gdrive_files.json', 'r', encoding='utf-8'))
for item in data.get('ket_pet_ielts', []):
    name = item['name']
    if name.endswith('.docx') or name.endswith('.doc'):
        sz = int(item.get('size', 0)) // 1024
        print(f"{name} | {sz} KB | {item['id']}")

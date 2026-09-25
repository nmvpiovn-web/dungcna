import json
import sys
import os
import requests

sys.stdout.reconfigure(encoding='utf-8')

token_info = json.load(open('scripts/gdrive_token.json', 'r', encoding='utf-8'))
headers = {'Authorization': 'Bearer ' + token_info['access_token']}

inv = json.load(open('scripts/all_gdrive_inventory.json', 'r', encoding='utf-8'))
all_files = inv.get('all', [])

targets = ['chuyen de', 'de thi vao 10', 'on tap hoc ky', 'reading', 'speaking', 'ielts']
found_files = []

for t in targets:
    matches = [f for f in all_files if t in f['name'].lower() and f['name'].endswith('.docx')]
    print(f'Target "{t}": {len(matches)} files found')
    for m in matches[:2]:
        sz = int(m.get('size', 0)) // 1024
        print(f'   - {m["name"]} ({sz} KB, id: {m["id"]})')
        found_files.append(m)

# Download top 4 unique docx if not yet downloaded
downloaded = 0
for f in found_files[:6]:
    fname = "".join(c if c.isalnum() or c in '._- ' else '_' for c in f['name'])
    out_path = os.path.join('data/gdrive_downloads', fname)
    if os.path.exists(out_path):
        continue
    file_id = f['id']
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
    res = requests.get(url, headers=headers, stream=True)
    if res.status_code == 200:
        with open(out_path, 'wb') as out_f:
            for chunk in res.iter_content(chunk_size=8192):
                out_f.write(chunk)
        print(f"Downloaded: {fname} ({os.path.getsize(out_path)//1024} KB)")
        downloaded += 1

print(f"Total newly downloaded: {downloaded}")

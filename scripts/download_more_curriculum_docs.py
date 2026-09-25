import json
import os
import requests
import sys

sys.stdout.reconfigure(encoding='utf-8')

token_info = json.load(open('scripts/gdrive_token.json', 'r', encoding='utf-8'))
access_token = token_info['access_token']
headers = {'Authorization': f'Bearer {access_token}'}

inventory = json.load(open('scripts/all_gdrive_inventory.json', 'r', encoding='utf-8'))
all_files = inventory['all']

os.makedirs('data/gdrive_downloads', exist_ok=True)

# Target high yield docx / doc files
targets = [
    '31. VIET LAI CAU - THI HSG LOP 10,11,12.docx',
    'NHÓM  7. CHUYÊN ĐỀ PHỐI HỢP THÌ THPT Hương Khê.docx',
    'ĐỀ HSG ANH 8 SỐ 24.docx',
    'ĐỀ HSG ANH 8 SỐ 23.docx',
    'IOE LOP 5 TRON BO.docx',
    'GRADE 6- U8- GLOBAL SUCCESS.doc',
    'PHRASAL VERBS.docx'
]

downloaded = 0
for t in targets:
    matched = [f for f in all_files if f['name'] == t]
    if not matched:
        # Try case-insensitive substring
        matched = [f for f in all_files if t.lower() in f['name'].lower()]
    if matched:
        f_info = matched[0]
        file_id = f_info['id']
        file_name = f_info['name']
        safe_name = "".join(c if c.isalnum() or c in '._- ' else '_' for c in file_name)
        out_path = os.path.join('data/gdrive_downloads', safe_name)
        if os.path.exists(out_path):
            print(f"Already exists: {safe_name}")
            continue
        print(f"Downloading: {file_name} ({file_id}) -> {safe_name}")
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
        res = requests.get(url, headers=headers, stream=True)
        if res.status_code == 200:
            with open(out_path, 'wb') as f:
                for chunk in res.iter_content(chunk_size=8192):
                    f.write(chunk)
            print(f"Saved {safe_name} ({os.path.getsize(out_path)//1024} KB)")
            downloaded += 1
        else:
            print(f"Failed {file_name}: {res.status_code}")

print(f"Done. Downloaded {downloaded} files.")

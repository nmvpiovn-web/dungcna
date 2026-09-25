import json
import os
import requests
import sys

sys.stdout.reconfigure(encoding='utf-8')

token_info = json.load(open('scripts/gdrive_token.json', 'r', encoding='utf-8'))
headers = {'Authorization': 'Bearer ' + token_info['access_token']}

file_id = "1N-PCJXl052xr8w414RXvvkObqHp0CLDl"
out_path = "data/gdrive_downloads/22000_tu_toefl_ielts_harold_levine.docx"

if not os.path.exists(out_path):
    print("Downloading 22,000 từ TOEFL, IELTS Harold Levine...")
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
    res = requests.get(url, headers=headers, stream=True)
    if res.status_code == 200:
        with open(out_path, 'wb') as f:
            for chunk in res.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"Saved to {out_path} ({os.path.getsize(out_path)//1024} KB)")
    else:
        print("Download failed:", res.status_code)
else:
    print("Already exists!")

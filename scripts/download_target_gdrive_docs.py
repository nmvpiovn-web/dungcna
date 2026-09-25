import urllib.request
import json
import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

print("=== DOWNLOADING TARGET GDRIVE GRAMMAR & KEY WORKSHEETS ===")

with open('scripts/gdrive_token.json', 'r', encoding='utf-8') as f:
    token_cfg = json.load(f)

access_token = token_cfg['access_token']
headers = {"Authorization": f"Bearer {access_token}"}

os.makedirs('data/gdrive_downloads', exist_ok=True)

targets = [
    {"name": "phrasal_verbs_key.docx", "id": "1-Um6vnopIcCUrFYM59wukrmFTY6Ai0UM"},
    {"name": "conditional_sentences_key.docx", "id": "1x6Ng42fehYnHH63_agoh7UmEYidhg-Q7"},
    {"name": "relative_clause_key.docx", "id": "1L1l1lOgwtXSHVEgKQMuJt18_UDYoPhbS"},
    {"name": "reported_speech_key.docx", "id": "1tibb8zJTF3Qu2-u02Qtbp_3k7H6992pX"},
    {"name": "although_despite_key.docx", "id": "1tHuK1s_xdta7xDt0utmNgf9X39tb_FCr"},
    {"name": "because_because_of_key.docx", "id": "1UobcCJOSPOhfqUCvRQD27dNxXfMYgBb_"},
    {"name": "so_that_in_order_to_key.docx", "id": "1OO1jzNtmnZJeh9EBwGxe4K9Ld85rvSPU"}
]

for t in targets:
    out_path = os.path.join('data/gdrive_downloads', t['name'])
    if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
        print(f"Skipping {t['name']} (already downloaded: {os.path.getsize(out_path)} bytes)")
        continue
    
    url = f"https://www.googleapis.com/drive/v3/files/{t['id']}?alt=media"
    req = urllib.request.Request(url, headers=headers)
    try:
        print(f"Downloading {t['name']} (ID: {t['id']})...")
        with urllib.request.urlopen(req) as resp, open(out_path, 'wb') as out_f:
            out_f.write(resp.read())
        print(f"  -> Saved {t['name']}: {os.path.getsize(out_path)} bytes")
    except Exception as e:
        print(f"  -> Failed to download {t['name']}: {e}")

print("=== DOWNLOAD COMPLETE! ===")

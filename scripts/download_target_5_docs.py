import urllib.request
import json
import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

print("=== DOWNLOADING 5 HIGH-YIELD ADVANCED DOCUMENTS ===")

with open('scripts/gdrive_token.json', 'r', encoding='utf-8') as f:
    token_cfg = json.load(f)

headers = {'Authorization': f'Bearer {token_cfg["access_token"]}'}

targets = [
    {'name': '1000_cau_trac_nghiem_ngu_phap_hsg.docx', 'id': '1DaONRHiIRbdnm6Afm38PdAFH_4NDV87S'},
    {'name': 'viet_lai_cau_1_100.docx', 'id': '1ZvpwokGe-qQ3sVoyBe1MGc6K9HW7DE8Y'},
    {'name': 'our_heritage_vocab.docx', 'id': '1AzFa3EEULsqvRR8MQKC08I9L6kVIpHqL'},
    {'name': 'cities_urbanisation_vocab.docx', 'id': '1iRC8wPvflaF_95qMaZhx7t3V9KiwSMfb'},
    {'name': 'becoming_independent_vocab.docx', 'id': '1C59JRKwEcCz3j9akiVTzi746ntga2slW'}
]

for t in targets:
    out_path = os.path.join('data/gdrive_downloads', t['name'])
    if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
        print(f"Already downloaded {t['name']} ({os.path.getsize(out_path)} bytes)")
        continue
    url = f"https://www.googleapis.com/drive/v3/files/{t['id']}?alt=media"
    req = urllib.request.Request(url, headers=headers)
    try:
        print(f"Downloading {t['name']}...")
        with urllib.request.urlopen(req) as resp, open(out_path, 'wb') as out_f:
            out_f.write(resp.read())
        print(f"  -> Saved {t['name']}: {os.path.getsize(out_path)} bytes")
    except Exception as e:
        print(f"  -> Failed {t['name']}: {e}")

print("=== DOWNLOAD COMPLETE! ===")

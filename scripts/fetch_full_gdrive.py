import urllib.request
import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ACCESS_TOKEN = "ya29.a0AX07CmvARPoFKRkiMTjG_AOCKUzv4wfw23Eb0HJFyJNdpBPw3aLJyz_4iqsmpElSaZpKNU_dXvVCVGiNImM1xBwZvyvsAON404ahL4LYZA4BICN6rNblb3sQoUAAgELCrnEeCLW_Tbcb60dfTPihBqsVbUVy_45p9iGr4kUIIb11XXffhedU0qT436TR_o8XI8BYuM8aCgYKAUQSARUSFQHGX2MipM65m4SEVJIISeVOP9m-Bg0206"
headers = {"Authorization": f"Bearer {ACCESS_TOKEN}"}

all_files = []
page_token = None

while True:
    url = "https://www.googleapis.com/drive/v3/files?pageSize=100&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)&q=trashed%3Dfalse"
    if page_token:
        url += f"&pageToken={page_token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            files = data.get('files', [])
            all_files.extend(files)
            page_token = data.get('nextPageToken')
            if not page_token:
                break
    except Exception as e:
        print(f"Error fetching page: {e}")
        break

print(f"Total Google Drive items found: {len(all_files)}")

# Group by mimeType and folders
folders = [f for f in all_files if f.get('mimeType') == 'application/vnd.google-apps.folder']
docs = [f for f in all_files if 'word' in f.get('mimeType', '') or f.get('name', '').endswith(('.doc', '.docx'))]
audio = [f for f in all_files if 'audio' in f.get('mimeType', '') or f.get('name', '').endswith('.mp3')]
ppts = [f for f in all_files if 'presentation' in f.get('mimeType', '') or f.get('name', '').endswith(('.ppt', '.pptx'))]
pdfs = [f for f in all_files if f.get('mimeType') == 'application/pdf' or f.get('name', '').endswith('.pdf')]
zips = [f for f in all_files if 'zip' in f.get('mimeType', '') or f.get('name', '').endswith(('.zip', '.rar', '.7z'))]

print(f"- Folders: {len(folders)}")
print(f"- Documents (doc/docx): {len(docs)}")
print(f"- Audio (mp3 listening): {len(audio)}")
print(f"- Presentations (pptx): {len(ppts)}")
print(f"- PDFs: {len(pdfs)}")
print(f"- Compressed archives: {len(zips)}")

print("\n--- FOLDERS FOUND ---")
for f in folders:
    print(f"📁 {f['name']} (ID: {f['id']})")

print("\n--- SAMPLE DOCUMENTS FOUND ---")
for d in docs[:20]:
    print(f"📄 {d['name']} (ID: {d['id']}, Size: {d.get('size')} bytes)")

with open('scripts/all_gdrive_inventory.json', 'w', encoding='utf-8') as out:
    json.dump({
        'total': len(all_files),
        'folders': folders,
        'docs': docs,
        'audio': audio,
        'ppts': ppts,
        'pdfs': pdfs,
        'zips': zips,
        'all': all_files
    }, out, ensure_ascii=False, indent=2)

print("\nSaved inventory to scripts/all_gdrive_inventory.json")

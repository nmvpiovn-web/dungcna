import urllib.request
import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ACCESS_TOKEN = "ya29.a0AX07CmvARPoFKRkiMTjG_AOCKUzv4wfw23Eb0HJFyJNdpBPw3aLJyz_4iqsmpElSaZpKNU_dXvVCVGiNImM1xBwZvyvsAON404ahL4LYZA4BICN6rNblb3sQoUAAgELCrnEeCLW_Tbcb60dfTPihBqsVbUVy_45p9iGr4kUIIb11XXffhedU0qT436TR_o8XI8BYuM8aCgYKAUQSARUSFQHGX2MipM65m4SEVJIISeVOP9m-Bg0206"
headers = {"Authorization": f"Bearer {ACCESS_TOKEN}"}

# 1. Fetch all folders
url = "https://www.googleapis.com/drive/v3/files?pageSize=100&q=mimeType%3D%27application%2Fvnd.google-apps.folder%27%20and%20trashed%3Dfalse&fields=files(id,name,parents)"
req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as resp:
    folders_data = json.loads(resp.read().decode('utf-8'))
    folders = folders_data.get('files', [])

print(f"=== GOOGLE DRIVE FOLDERS ({len(folders)}) ===")
folder_map = {f['id']: f['name'] for f in folders}
for f in folders:
    p_names = [folder_map.get(pid, pid) for pid in f.get('parents', [])]
    print(f"📁 {f['name']} (ID: {f['id']}, Parent: {p_names})")

# 2. For each folder, count files by type
print("\n=== SCANNING CONTENTS PER FOLDER ===")
for f in folders:
    f_id = f['id']
    f_url = f"https://www.googleapis.com/drive/v3/files?pageSize=100&q=%27{f_id}%27%20in%20parents%20and%20trashed%3Dfalse&fields=files(id,name,mimeType,size)"
    f_req = urllib.request.Request(f_url, headers=headers)
    try:
        with urllib.request.urlopen(f_req) as f_resp:
            c_data = json.loads(f_resp.read().decode('utf-8'))
            c_files = c_data.get('files', [])
            types = {}
            for item in c_files:
                ext = item['name'].split('.')[-1].lower() if '.' in item['name'] else item['mimeType']
                types[ext] = types.get(ext, 0) + 1
            print(f"\n📂 [{f['name']}] (Total: {len(c_files)} items)")
            for ext, count in types.items():
                print(f"   - .{ext}: {count} files")
            print("   Sample files:")
            for item in c_files[:5]:
                print(f"     * {item['name']} ({round(int(item.get('size', 0))/(1024*1024), 2) if item.get('size') else 'dir'} MB)")
    except Exception as err:
        print(f"Error querying folder {f['name']}: {err}")

with open('scripts/gdrive_folders_summary.json', 'w', encoding='utf-8') as out:
    json.dump(folders, out, ensure_ascii=False, indent=2)

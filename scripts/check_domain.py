import urllib.request
import json
import re

# Read oauth token from wrangler config
token = ''
config_path = r'C:\Users\admin\AppData\Roaming\xdg.config\.wrangler\config\default.toml'
with open(config_path, 'r', encoding='utf-8') as f:
    content = f.read()
    m = re.search(r'oauth_token\s*=\s*["\']([^"\']+)["\']', content)
    if m:
        token = m.group(1)

account_id = '9bca45c9a8ff34be86d4a4bf0cc0245f'
print('Token loaded successfully:', bool(token))

# 1. Query zones to find timbk.io.vn
url = 'https://api.cloudflare.com/client/v4/zones?name=timbk.io.vn'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})

try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print('Zones query result:')
        print(json.dumps(data, indent=2))
except urllib.error.HTTPError as e:
    print('HTTP Error:', e.code, e.read().decode('utf-8'))
except Exception as e:
    print('Error:', e)

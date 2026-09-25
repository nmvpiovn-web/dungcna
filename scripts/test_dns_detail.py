import urllib.request
import json
import re

config_path = r'C:\Users\admin\AppData\Roaming\xdg.config\.wrangler\config\default.toml'
with open(config_path, 'r', encoding='utf-8') as f:
    token = re.search(r'oauth_token\s*=\s*["\']([^"\']+)["\']', f.read()).group(1)

zone_id = '054ecc44a1750c75002d7a5773c54836'

print('Token preview:', token[:10] + '...' + token[-6:])

# 1. Test GET dns_records
url = f'https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
try:
    with urllib.request.urlopen(req) as resp:
        print('DNS GET SUCCESS:', resp.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('DNS GET HTTP ERROR:', e.code, e.read().decode('utf-8'))

# 2. Test user token verify
verify_url = 'https://api.cloudflare.com/client/v4/user/tokens/verify'
v_req = urllib.request.Request(verify_url, headers={'Authorization': f'Bearer {token}'})
try:
    with urllib.request.urlopen(v_req) as resp:
        print('TOKEN VERIFY SUCCESS:', resp.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('TOKEN VERIFY HTTP ERROR:', e.code, e.read().decode('utf-8'))

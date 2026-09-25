import urllib.request
import json
import re

token = ''
config_path = r'C:\Users\admin\AppData\Roaming\xdg.config\.wrangler\config\default.toml'
with open(config_path, 'r', encoding='utf-8') as f:
    content = f.read()
    m = re.search(r'oauth_token\s*=\s*["\']([^"\']+)["\']', content)
    if m:
        token = m.group(1)

account_id = '9bca45c9a8ff34be86d4a4bf0cc0245f'
project_name = 'tienganh7-pro'
zone_id = '054ecc44a1750c75002d7a5773c54836'

def add_domain_to_pages(domain):
    url = f'https://api.cloudflare.com/client/v4/accounts/{account_id}/pages/projects/{project_name}/domains'
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    data = json.dumps({'name': domain}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as resp:
            res = json.loads(resp.read().decode('utf-8'))
            print(f'Successfully added domain {domain}:', res.get('success'))
            print(json.dumps(res, indent=2))
            return res
    except urllib.error.HTTPError as e:
        print(f'HTTP Error adding {domain}:', e.code, e.read().decode('utf-8'))
    except Exception as e:
        print(f'Error adding {domain}:', e)

# 1. Add timbk.io.vn
add_domain_to_pages('timbk.io.vn')

# 2. Add www.timbk.io.vn
add_domain_to_pages('www.timbk.io.vn')

UPDATE users SET metadata = json('{"must_change_password":true,"provisioned_from":"rec_1791618285933_u9t1","provisioned_by":"usr_super_1","provisioned_at":"2026-10-10T08:25:54.699Z"}') WHERE id = 'user_0e9f81f5-9156-49b0-bc55-846d73af1548';
SELECT json_extract(metadata, '$.must_change_password') as mcp FROM users WHERE id = 'user_0e9f81f5-9156-49b0-bc55-846d73af1548';

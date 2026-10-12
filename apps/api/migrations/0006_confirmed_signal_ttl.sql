-- Owner confirmed PRD option A on 2026-10-12. Fill previously unconfigured
-- durations; retain explicit numeric settings and historical signal expiries.
INSERT INTO settings_audit(id,category,old_json,new_json,version,at)
SELECT 'migration-0006-scanner-ttl','scanner',value_json,
  json_set(value_json,
    '$.ttl."5m"', coalesce(json_extract(value_json,'$.ttl."5m"'),900),
    '$.ttl."15m"', coalesce(json_extract(value_json,'$.ttl."15m"'),2700),
    '$.ttl.H1', coalesce(json_extract(value_json,'$.ttl.H1'),10800),
    '$.ttl.H4', coalesce(json_extract(value_json,'$.ttl.H4'),43200),
    '$.ttl.D1', coalesce(json_extract(value_json,'$.ttl.D1'),259200)),
  version+1,unixepoch()*1000
FROM settings WHERE id='scanner' AND (
  json_extract(value_json,'$.ttl."5m"') IS NULL OR
  json_extract(value_json,'$.ttl."15m"') IS NULL OR
  json_extract(value_json,'$.ttl.H1') IS NULL OR
  json_extract(value_json,'$.ttl.H4') IS NULL OR
  json_extract(value_json,'$.ttl.D1') IS NULL);
UPDATE settings SET
  value_json=(SELECT new_json FROM settings_audit WHERE id='migration-0006-scanner-ttl'),
  version=(SELECT version FROM settings_audit WHERE id='migration-0006-scanner-ttl'),
  updated_at=(SELECT at FROM settings_audit WHERE id='migration-0006-scanner-ttl')
WHERE id='scanner' AND EXISTS(SELECT 1 FROM settings_audit WHERE id='migration-0006-scanner-ttl');

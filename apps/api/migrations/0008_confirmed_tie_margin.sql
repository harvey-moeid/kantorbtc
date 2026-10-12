-- Owner selected a 40-point scanner advantage for AI 2-2 on 2026-10-12.
-- Only fill previously unconfigured values; retain numeric admin overrides.
INSERT INTO settings_audit(id,category,old_json,new_json,version,at)
SELECT 'migration-0008-scanner-margin','scanner',value_json,
  json_set(value_json,'$.tieMargin',40),version+1,unixepoch()*1000
FROM settings WHERE id='scanner' AND json_extract(value_json,'$.tieMargin') IS NULL;
UPDATE settings SET
  value_json=(SELECT new_json FROM settings_audit WHERE id='migration-0008-scanner-margin'),
  version=(SELECT version FROM settings_audit WHERE id='migration-0008-scanner-margin'),
  updated_at=(SELECT at FROM settings_audit WHERE id='migration-0008-scanner-margin')
WHERE id='scanner' AND EXISTS(SELECT 1 FROM settings_audit WHERE id='migration-0008-scanner-margin');

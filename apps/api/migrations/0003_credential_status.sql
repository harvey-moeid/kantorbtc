ALTER TABLE api_credentials ADD COLUMN test_status TEXT NOT NULL DEFAULT 'untested';
ALTER TABLE api_credentials ADD COLUMN tested_at INTEGER;

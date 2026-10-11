CREATE TABLE IF NOT EXISTS backfill_jobs (id TEXT PRIMARY KEY, symbol TEXT NOT NULL, tf TEXT NOT NULL, from_time INTEGER NOT NULL, to_time INTEGER NOT NULL, cursor_time INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', rows_saved INTEGER NOT NULL DEFAULT 0, error TEXT, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS backfill_status ON backfill_jobs(status,updated_at);

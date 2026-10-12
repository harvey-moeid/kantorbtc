ALTER TABLE backfill_jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'manual';
CREATE INDEX IF NOT EXISTS backfill_kind_status ON backfill_jobs(status,kind,updated_at);

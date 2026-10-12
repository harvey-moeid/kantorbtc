CREATE TABLE cot_reports (
  report_date TEXT PRIMARY KEY,
  fetched_at INTEGER NOT NULL,
  value_json TEXT NOT NULL
);
CREATE TABLE cot_sync (
  id TEXT PRIMARY KEY CHECK(id='gold'),
  checked_at INTEGER NOT NULL,
  warning TEXT
);

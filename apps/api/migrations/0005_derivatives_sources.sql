-- Retain independent exchange baselines, even for snapshots at the same time.
ALTER TABLE derivatives RENAME TO derivatives_old;
CREATE TABLE derivatives (symbol TEXT NOT NULL, at INTEGER NOT NULL, source TEXT NOT NULL, funding REAL NOT NULL, open_interest REAL NOT NULL, oi_change REAL, is_proxy INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(symbol,source,at));
INSERT INTO derivatives SELECT * FROM derivatives_old;
DROP TABLE derivatives_old;

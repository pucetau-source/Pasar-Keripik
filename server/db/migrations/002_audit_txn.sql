-- Groups audit rows written by the same save (one API request / one Writer transaction).
-- NULL for rows written before this migration (they are grouped by user + second instead).
ALTER TABLE audit_log ADD COLUMN txn TEXT;

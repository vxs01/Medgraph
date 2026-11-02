-- ALTER: generated column + GIN index for full-text search (the application uses these)
ALTER TABLE clinical_notes
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(chief_complaint, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(observation_text, '')), 'B')
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_notes_fts ON clinical_notes USING gin (search_tsv);

-- ALTER: a business rule added after the table was created (kept permanently)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rx_quantity_max') THEN
    ALTER TABLE prescriptions ADD CONSTRAINT chk_rx_quantity_max CHECK (quantity <= 1000);
  END IF;
END $$;

-- ALTER and DROP, self-contained demonstration (leaves the schema unchanged)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email VARCHAR(100);
ALTER TABLE patients ALTER COLUMN email SET DEFAULT 'unknown@example.com';
ALTER TABLE patients RENAME COLUMN email TO contact_email;
ALTER TABLE patients DROP COLUMN IF EXISTS contact_email;

CREATE TABLE IF NOT EXISTS tmp_demo (id INT PRIMARY KEY, note TEXT);
CREATE INDEX IF NOT EXISTS idx_tmp_demo_note ON tmp_demo(note);
DROP INDEX IF EXISTS idx_tmp_demo_note;
DROP TABLE IF EXISTS tmp_demo;

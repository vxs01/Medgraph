-- B-tree indexes on foreign keys (PostgreSQL does not create these automatically)
CREATE INDEX IF NOT EXISTS idx_admissions_patient ON admissions(patient_id);
CREATE INDEX IF NOT EXISTS idx_admissions_doctor  ON admissions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_notes_patient      ON clinical_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_notes_doctor       ON clinical_notes(doctor_id);
CREATE INDEX IF NOT EXISTS idx_rx_patient         ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_rx_med             ON prescriptions(med_id);
CREATE INDEX IF NOT EXISTS idx_audit_logged_at    ON audit_logs(logged_at DESC);

-- Expression index: case-insensitive name lookup (matches WHERE lower(last_name) = ...)
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(lower(last_name), lower(first_name));

-- Partial indexes: only the rows that queries actually ask for
CREATE INDEX IF NOT EXISTS idx_admissions_active_ward ON admissions(ward_id) WHERE status = 'ADMITTED';
-- ... and the same idea as a constraint: one active admission per patient
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_admission ON admissions(patient_id) WHERE status = 'ADMITTED';

-- Vector index: HNSW approximate nearest-neighbour search, cosine distance
CREATE INDEX IF NOT EXISTS idx_notes_embedding_hnsw ON clinical_notes USING hnsw (embedding vector_cosine_ops);

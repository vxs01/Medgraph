-- Query processing and optimisation: read the plans.
-- Look for: Seq Scan vs Index Scan, join type (Nested Loop, Hash Join, Merge Join),
-- estimated rows vs actual rows, and Execution Time.
-- With only a few seeded rows PostgreSQL often prefers a sequential scan; run
-- `npm run demo:explain` to compare plans on 50,000 generated rows.

-- Expression index idx_patients_name serves this predicate
EXPLAIN SELECT * FROM patients WHERE lower(last_name) = 'sharma';

-- Join order and join algorithm chosen by the optimiser
EXPLAIN ANALYZE
SELECT p.last_name, w.ward_name, u.full_name
FROM admissions a JOIN patients p USING (patient_id) JOIN wards w USING (ward_id) JOIN users u ON u.user_id = a.doctor_id
WHERE a.status = 'ADMITTED';

-- Partial index idx_admissions_active_ward: the WHERE clause matches the index predicate
EXPLAIN SELECT ward_id, COUNT(*) FROM admissions WHERE status = 'ADMITTED' GROUP BY ward_id;

-- Full-text search uses the GIN index idx_notes_fts
EXPLAIN SELECT note_id FROM clinical_notes WHERE search_tsv @@ websearch_to_tsquery('english', 'chest pain');

-- Nearest-neighbour search: HNSW index (approximate) vs exact sort of every row
EXPLAIN SELECT note_id FROM clinical_notes ORDER BY embedding <=> (SELECT embedding FROM clinical_notes LIMIT 1) LIMIT 5;

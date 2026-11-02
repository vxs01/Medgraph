-- Read-only demonstration queries, grouped by syllabus unit.
-- `npm run test:db` executes this file to prove every statement is valid.

-- ======================================================= UNIT 1: relational algebra in SQL
-- 1.1 Selection   sigma_{blood_group='O+'}(PATIENTS)
SELECT * FROM patients WHERE blood_group = 'O+';

-- 1.2 Projection  pi_{blood_group}(PATIENTS)   (DISTINCT: relations are sets)
SELECT DISTINCT blood_group FROM patients ORDER BY blood_group;

-- 1.3 pi_{first_name,last_name,ward_name}( sigma_{status='ADMITTED'}( PATIENTS |x| ADMISSIONS |x| WARDS ) )
SELECT p.first_name, p.last_name, w.ward_name
FROM patients p JOIN admissions a USING (patient_id) JOIN wards w USING (ward_id)
WHERE a.status = 'ADMITTED';

-- 1.4 Rename + theta join: pairs of different patients with the same blood group
--     pi( sigma_{p1.blood_group = p2.blood_group AND p1.id < p2.id}( rho_p1(PATIENTS) x rho_p2(PATIENTS) ) )
SELECT p1.first_name || ' ' || p1.last_name AS patient_1,
       p2.first_name || ' ' || p2.last_name AS patient_2, p1.blood_group
FROM patients p1 JOIN patients p2 ON p1.blood_group = p2.blood_group AND p1.patient_id < p2.patient_id
ORDER BY p1.blood_group;

-- 1.5 Grouping / aggregation  gamma_{ward_id; COUNT(*) -> admitted}( sigma_{status='ADMITTED'}(ADMISSIONS) )
SELECT ward_id, COUNT(*) AS admitted FROM admissions WHERE status = 'ADMITTED' GROUP BY ward_id;

-- 1.6 Division: doctors who have admitted a patient to EVERY ward
--     pi_{doctor_id,ward_id}(ADMISSIONS)  divided by  pi_{ward_id}(WARDS)
--     (SQL has no division operator: "no ward exists that this doctor has not used")
SELECT u.full_name
FROM users u
WHERE u.role = 'DOCTOR'
  AND NOT EXISTS (SELECT 1 FROM wards w
                  WHERE NOT EXISTS (SELECT 1 FROM admissions a
                                    WHERE a.doctor_id = u.user_id AND a.ward_id = w.ward_id));

-- ======================================================= UNIT 2: joins
-- 2.1 INNER JOIN + GROUP BY
SELECT w.ward_name, COUNT(*) AS admissions_ever
FROM wards w JOIN admissions a ON a.ward_id = w.ward_id GROUP BY w.ward_name;

-- 2.2 LEFT JOIN as an anti-join: patients who were never admitted
SELECT p.first_name, p.last_name
FROM patients p LEFT JOIN admissions a ON a.patient_id = p.patient_id
WHERE a.admission_id IS NULL;

-- 2.3 RIGHT JOIN: every ward, including empty ones, with its current admissions
SELECT w.ward_name, COUNT(a.admission_id) AS admitted_now
FROM admissions a RIGHT JOIN wards w ON w.ward_id = a.ward_id AND a.status = 'ADMITTED'
GROUP BY w.ward_name ORDER BY w.ward_name;

-- 2.4 FULL OUTER JOIN: patients with notes only, prescriptions only, or both
SELECT p.first_name, p.last_name, n.patient_id IS NOT NULL AS has_notes, r.patient_id IS NOT NULL AS has_prescriptions
FROM (SELECT DISTINCT patient_id FROM clinical_notes) n
FULL OUTER JOIN (SELECT DISTINCT patient_id FROM prescriptions) r ON r.patient_id = n.patient_id
JOIN patients p ON p.patient_id = COALESCE(n.patient_id, r.patient_id)
ORDER BY p.last_name;

-- 2.5 CROSS JOIN: every doctor-ward pair (the Cartesian product), used to spot gaps
SELECT u.full_name, w.ward_name
FROM users u CROSS JOIN wards w WHERE u.role = 'DOCTOR' ORDER BY u.full_name, w.ward_name;

-- 2.6 NATURAL JOIN joins on every column name the tables share (here only patient_id).
--     Convenient in a demo, risky in real code: adding a same-named column silently changes the join.
SELECT first_name, last_name, status FROM patients NATURAL JOIN admissions;

-- ======================================================= UNIT 2: set operations
SELECT patient_id FROM clinical_notes INTERSECT SELECT patient_id FROM prescriptions;  -- both
SELECT patient_id FROM clinical_notes EXCEPT    SELECT patient_id FROM prescriptions;  -- notes, but no prescription
SELECT patient_id FROM admissions     UNION     SELECT patient_id FROM prescriptions;  -- either, duplicates removed
SELECT COUNT(*) AS with_duplicates FROM (SELECT patient_id FROM admissions UNION ALL SELECT patient_id FROM prescriptions) t;

-- ======================================================= UNIT 2: NULL handling
-- NULL = NULL is unknown, not true, so "= NULL" never matches
SELECT COUNT(*) FILTER (WHERE discharge_date = NULL)  AS wrong_equals_null,
       COUNT(*) FILTER (WHERE discharge_date IS NULL) AS correct_is_null,
       COUNT(*)              AS all_rows,
       COUNT(discharge_date) AS non_null_discharge_dates         -- COUNT(column) skips NULLs
FROM admissions;
SELECT AVG(discharge_date - admission_date) AS average_completed_stay FROM admissions;   -- AVG ignores NULLs
SELECT med_name, unit_price / NULLIF(stock_quantity, 0) AS price_per_unit_in_stock FROM medications;  -- avoids divide by zero
SELECT a.admission_id, COALESCE(w.ward_name, '(ward removed)') AS ward
FROM admissions a LEFT JOIN wards w ON w.ward_id = a.ward_id;

-- ======================================================= UNIT 2: aggregates
SELECT COUNT(*) AS prescriptions, SUM(quantity) AS units, ROUND(AVG(quantity), 1) AS avg_quantity,
       MIN(prescribed_date) AS first_rx, MAX(prescribed_date) AS last_rx
FROM prescriptions;

SELECT m.med_name, SUM(rx.quantity) AS units, SUM(rx.quantity * m.unit_price) AS revenue
FROM prescriptions rx JOIN medications m ON m.med_id = rx.med_id
GROUP BY m.med_name HAVING SUM(rx.quantity) > 10 ORDER BY revenue DESC;

SELECT u.full_name, STRING_AGG(DISTINCT w.ward_name, ', ' ORDER BY w.ward_name) AS wards_used
FROM admissions a JOIN users u ON u.user_id = a.doctor_id JOIN wards w ON w.ward_id = a.ward_id
GROUP BY u.full_name;

-- ROLLUP adds subtotal and grand-total rows
SELECT COALESCE(w.ward_name, 'All wards') AS ward, COALESCE(a.status, 'All statuses') AS status, COUNT(*) AS n
FROM admissions a JOIN wards w ON w.ward_id = a.ward_id
GROUP BY ROLLUP (w.ward_name, a.status) ORDER BY w.ward_name NULLS LAST, a.status NULLS LAST;

-- ======================================================= UNIT 2: nested and correlated subqueries
-- scalar subquery
SELECT med_name, unit_price FROM medications WHERE unit_price > (SELECT AVG(unit_price) FROM medications);
-- IN
SELECT first_name, last_name FROM patients
WHERE patient_id IN (SELECT patient_id FROM admissions WHERE status = 'ADMITTED');
-- NOT EXISTS: medications never prescribed
SELECT m.med_name FROM medications m WHERE NOT EXISTS (SELECT 1 FROM prescriptions rx WHERE rx.med_id = m.med_id);
-- ALL: the most expensive medication
SELECT med_name FROM medications WHERE unit_price >= ALL (SELECT unit_price FROM medications);
-- derived table: patients with more notes than the average patient who has notes
SELECT p.first_name, p.last_name, c.notes
FROM patients p
JOIN (SELECT patient_id, COUNT(*) AS notes FROM clinical_notes GROUP BY patient_id) c ON c.patient_id = p.patient_id
WHERE c.notes > (SELECT AVG(notes) FROM (SELECT COUNT(*) AS notes FROM clinical_notes GROUP BY patient_id) t);
-- correlated: each patient's most recent note (the inner query re-runs for every outer row)
SELECT p.first_name, p.last_name, n.chief_complaint, n.created_at
FROM patients p JOIN clinical_notes n ON n.patient_id = p.patient_id
WHERE n.created_at = (SELECT MAX(n2.created_at) FROM clinical_notes n2 WHERE n2.patient_id = p.patient_id);
-- correlated in the SELECT list
SELECT p.first_name, p.last_name,
       (SELECT COUNT(*) FROM prescriptions rx WHERE rx.patient_id = p.patient_id) AS prescriptions
FROM patients p ORDER BY prescriptions DESC;

-- ======================================================= UNIT 2: CTEs
WITH used AS (SELECT med_id, SUM(quantity) AS units FROM prescriptions GROUP BY med_id)
SELECT m.med_name, m.stock_quantity, COALESCE(u.units, 0) AS prescribed,
       ROUND(m.stock_quantity::numeric / NULLIF(u.units, 0), 1) AS stock_per_unit_used
FROM medications m LEFT JOIN used u ON u.med_id = m.med_id ORDER BY m.stock_quantity;

-- recursive CTE: build the last 7 days, then count admissions per day (days with none show 0)
WITH RECURSIVE days(day) AS (
  SELECT current_date - 6
  UNION ALL
  SELECT day + 1 FROM days WHERE day < current_date
)
SELECT d.day, COUNT(a.admission_id) AS admissions
FROM days d LEFT JOIN admissions a ON a.admission_date::date = d.day
GROUP BY d.day ORDER BY d.day;

-- ======================================================= UNIT 2: window functions
SELECT u.full_name, n.created_at::date AS day, n.chief_complaint,
       ROW_NUMBER() OVER w AS nth_note, COUNT(*) OVER w AS running_total
FROM clinical_notes n JOIN users u ON u.user_id = n.doctor_id
WINDOW w AS (PARTITION BY u.user_id ORDER BY n.created_at)
ORDER BY u.full_name, n.created_at;

SELECT full_name, notes_written,
       RANK()       OVER (ORDER BY notes_written DESC) AS rank_with_gaps,
       DENSE_RANK() OVER (ORDER BY notes_written DESC) AS rank_without_gaps
FROM v_doctor_workload;

SELECT p.first_name, n.created_at,
       n.created_at - LAG(n.created_at) OVER (PARTITION BY n.patient_id ORDER BY n.created_at) AS since_previous_note
FROM clinical_notes n JOIN patients p ON p.patient_id = n.patient_id ORDER BY p.first_name, n.created_at;

SELECT med_name, unit_price, NTILE(4) OVER (ORDER BY unit_price) AS price_quartile FROM medications;

-- aggregate inside a window: each medication's share of all units prescribed
SELECT m.med_name, SUM(rx.quantity) AS units,
       ROUND(100.0 * SUM(rx.quantity) / SUM(SUM(rx.quantity)) OVER (), 1) AS percent_of_total
FROM prescriptions rx JOIN medications m ON m.med_id = rx.med_id GROUP BY m.med_name ORDER BY units DESC;

-- ======================================================= UNIT 2: full-text search functions
SELECT to_tsvector('english', 'Patients were wheezing at night') AS document,
       plainto_tsquery('english', 'wheeze night')                AS query_plain,
       phraseto_tsquery('english', 'memory loss')                AS query_phrase,
       websearch_to_tsquery('english', 'chest pain -fever')      AS query_web;

SELECT note_id, chief_complaint,
       ts_rank(search_tsv, q) AS rank,
       ts_headline('english', observation_text, q, 'StartSel=*, StopSel=*, MaxWords=30, MinWords=10') AS excerpt
FROM clinical_notes, websearch_to_tsquery('english', 'chest pain') AS q
WHERE search_tsv @@ q ORDER BY rank DESC;

SELECT chief_complaint FROM clinical_notes WHERE search_tsv @@ phraseto_tsquery('english', 'memory loss');
SELECT chief_complaint FROM clinical_notes WHERE search_tsv @@ to_tsquery('english', 'wheez:* & night');  -- prefix match

-- ======================================================= UNIT 4: vector search with relational data
-- "More like this": notes closest in meaning to a given note. <=> is cosine distance.
SELECT n2.chief_complaint, p.first_name || ' ' || p.last_name AS patient,
       ROUND((1 - (n2.embedding <=> n1.embedding))::numeric, 3) AS similarity
FROM clinical_notes n1
JOIN clinical_notes n2 ON n2.note_id <> n1.note_id
JOIN patients p ON p.patient_id = n2.patient_id
WHERE n1.chief_complaint ILIKE 'Progressive memory loss%'
ORDER BY n2.embedding <=> n1.embedding LIMIT 5;

-- Vector search combined with ordinary relational filters (patients over 50, currently admitted)
SELECT n2.chief_complaint, patient_age(p.dob) AS age,
       ROUND((1 - (n2.embedding <=> n1.embedding))::numeric, 3) AS similarity
FROM clinical_notes n1
JOIN clinical_notes n2 ON n2.note_id <> n1.note_id
JOIN patients p ON p.patient_id = n2.patient_id
WHERE n1.chief_complaint ILIKE 'Progressive memory loss%'
  AND patient_age(p.dob) > 50
  AND EXISTS (SELECT 1 FROM admissions a WHERE a.patient_id = p.patient_id AND a.status = 'ADMITTED')
ORDER BY n2.embedding <=> n1.embedding LIMIT 5;

-- The three pgvector distance operators side by side
SELECT n2.chief_complaint,
       ROUND((n2.embedding <=> n1.embedding)::numeric, 3) AS cosine_distance,
       ROUND((n2.embedding <-> n1.embedding)::numeric, 3) AS euclidean_distance,
       ROUND((n2.embedding <#> n1.embedding)::numeric, 3) AS negative_inner_product
FROM clinical_notes n1 JOIN clinical_notes n2 ON n2.note_id <> n1.note_id
WHERE n1.chief_complaint ILIKE 'Crushing chest pain%' ORDER BY cosine_distance LIMIT 3;

-- Views
SELECT * FROM v_ward_occupancy;
SELECT * FROM v_ward_consistency;
SELECT * FROM v_active_admissions ORDER BY admission_date;
SELECT * FROM v_doctor_workload;
SELECT event_time, event_type, summary FROM v_patient_timeline
WHERE patient_id = (SELECT patient_id FROM patients ORDER BY last_name LIMIT 1) ORDER BY event_time DESC;

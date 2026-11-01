-- Data modification examples. Everything runs inside one transaction that is rolled back,
-- so this file never changes your data. (The test suite runs it with its own rollback.)
BEGIN;

-- INSERT: several rows at once
INSERT INTO medications(med_name, stock_quantity, unit_price) VALUES ('Demo A', 10, 1.00), ('Demo B', 20, 2.00);

-- INSERT ... SELECT: rows computed from a query
INSERT INTO audit_logs(user_id, action_type, description)
SELECT NULL, 'DEMO', 'Low stock: ' || med_name FROM medications WHERE stock_quantity < 15;

-- Upsert: add a new medication or, if it exists, add to its stock
INSERT INTO medications(med_name, stock_quantity, unit_price) VALUES ('Demo A', 5, 1.00)
ON CONFLICT (med_name) DO UPDATE SET stock_quantity = medications.stock_quantity + EXCLUDED.stock_quantity
RETURNING med_name, stock_quantity;

-- UPDATE with an expression, returning the new values
UPDATE medications SET unit_price = ROUND(unit_price * 1.05, 2) WHERE med_name LIKE 'Demo%' RETURNING med_name, unit_price;

-- UPDATE ... FROM: change rows using values from another table or view
UPDATE wards w SET total_capacity = w.total_capacity + 1
FROM v_ward_occupancy v WHERE v.ward_id = w.ward_id AND v.occupancy_pct >= 100
RETURNING w.ward_name, w.total_capacity;

-- DELETE ... USING
DELETE FROM medications m USING (SELECT med_id FROM medications WHERE med_name LIKE 'Demo%') d WHERE m.med_id = d.med_id;

-- Data-modifying CTE: insert a patient and a note for them in one statement
WITH p AS (
  INSERT INTO patients(first_name, last_name, dob, gender, blood_group, phone_number, emergency_contact)
  VALUES ('Demo', 'Cascade', '1990-01-01', 'M', 'O+', '+91 90000 00001', '+91 90000 00002')
  RETURNING patient_id)
INSERT INTO clinical_notes(patient_id, doctor_id, chief_complaint, observation_text)
SELECT p.patient_id, (SELECT user_id FROM users WHERE role = 'DOCTOR' LIMIT 1), 'Demo complaint', 'Demo observation' FROM p;

-- DELETE cascades: removing the patient removes their note too (ON DELETE CASCADE)
DELETE FROM patients WHERE last_name = 'Cascade' RETURNING patient_id;
SELECT COUNT(*) AS notes_left_for_deleted_patient FROM clinical_notes WHERE chief_complaint = 'Demo complaint';

-- The audit trigger recorded the deletion
SELECT action_type, description FROM audit_logs WHERE action_type = 'PATIENT_DELETED' ORDER BY logged_at DESC LIMIT 1;

-- Stored procedures: CALL
-- CALL discharge_patient('<admission_id>');
-- CALL transfer_patient('<admission_id>', '<ward_id>');

ROLLBACK;

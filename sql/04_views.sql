CREATE OR REPLACE VIEW v_ward_occupancy AS
SELECT ward_id, ward_name, total_capacity, occupied_beds,
       total_capacity - occupied_beds AS available_beds,
       ROUND(100.0 * occupied_beds / total_capacity, 1) AS occupancy_pct
FROM wards;

-- Compares the stored counter with the real number of ADMITTED rows
CREATE OR REPLACE VIEW v_ward_consistency AS
SELECT w.ward_id, w.ward_name, w.occupied_beds AS recorded,
       (COUNT(a.admission_id) FILTER (WHERE a.status = 'ADMITTED'))::int AS actual,
       w.occupied_beds = COUNT(a.admission_id) FILTER (WHERE a.status = 'ADMITTED') AS consistent
FROM wards w LEFT JOIN admissions a ON a.ward_id = w.ward_id
GROUP BY w.ward_id, w.ward_name, w.occupied_beds;

CREATE OR REPLACE VIEW v_active_admissions AS
SELECT a.admission_id, a.patient_id,
       p.first_name || ' ' || p.last_name AS patient_name,
       patient_age(p.dob) AS age, p.blood_group,
       w.ward_name, a.ward_id, u.full_name AS doctor_name,
       a.admission_date,
       current_date - a.admission_date::date AS days_admitted
FROM admissions a
JOIN patients p ON p.patient_id = a.patient_id
LEFT JOIN wards w ON w.ward_id = a.ward_id
LEFT JOIN users u ON u.user_id = a.doctor_id
WHERE a.status = 'ADMITTED';

CREATE OR REPLACE VIEW v_doctor_workload AS
SELECT u.user_id, u.full_name,
  (SELECT COUNT(*)::int FROM admissions a WHERE a.doctor_id = u.user_id AND a.status = 'ADMITTED') AS active_patients,
  (SELECT COUNT(*)::int FROM clinical_notes n WHERE n.doctor_id = u.user_id) AS notes_written,
  (SELECT COUNT(*)::int FROM prescriptions rx WHERE rx.doctor_id = u.user_id) AS prescriptions_written
FROM users u WHERE u.role = 'DOCTOR';

-- One chronological feed per patient: four different tables merged with UNION ALL
CREATE OR REPLACE VIEW v_patient_timeline AS
SELECT a.patient_id, a.admission_date AS event_time, 'ADMISSION'::text AS event_type,
       'Admitted to ' || COALESCE(w.ward_name, 'a ward that no longer exists') AS summary,
       a.doctor_id, NULL::uuid AS note_id
FROM admissions a LEFT JOIN wards w ON w.ward_id = a.ward_id
UNION ALL
SELECT a.patient_id, a.discharge_date, 'DISCHARGE', 'Discharged', a.doctor_id, NULL
FROM admissions a WHERE a.status = 'DISCHARGED'
UNION ALL
SELECT n.patient_id, n.created_at, 'NOTE', n.chief_complaint, n.doctor_id, n.note_id
FROM clinical_notes n
UNION ALL
SELECT rx.patient_id, rx.prescribed_date, 'PRESCRIPTION',
       m.med_name || ', ' || rx.dosage || ', quantity ' || rx.quantity, rx.doctor_id, NULL
FROM prescriptions rx JOIN medications m ON m.med_id = rx.med_id;

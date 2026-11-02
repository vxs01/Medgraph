-- MedGraph schema. PostgreSQL 16 + pgvector.
-- Constraints are named so the application can show a precise message for each one.
-- Setup order: 01_schema, 02_indexes, 03_functions_triggers, 04_views, 05_alter_drop_demo

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     VARCHAR(100) NOT NULL CONSTRAINT chk_users_name CHECK (length(trim(full_name)) > 0),
  email         VARCHAR(100) NOT NULL CONSTRAINT uq_users_email UNIQUE
                CONSTRAINT chk_users_email CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash VARCHAR(255) NOT NULL,                      -- bcrypt hash, never the password
  role          VARCHAR(10)  NOT NULL CONSTRAINT chk_users_role CHECK (role IN ('DOCTOR','ADMIN')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  patient_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name        VARCHAR(50) NOT NULL CONSTRAINT chk_patients_first_name CHECK (length(trim(first_name)) > 0),
  last_name         VARCHAR(50) NOT NULL CONSTRAINT chk_patients_last_name  CHECK (length(trim(last_name)) > 0),
  dob               DATE        NOT NULL CONSTRAINT chk_patients_dob CHECK (dob > DATE '1900-01-01'),
  gender            CHAR(1)     NOT NULL CONSTRAINT chk_patients_gender CHECK (gender IN ('M','F','O')),
  blood_group       VARCHAR(3)  NOT NULL CONSTRAINT chk_patients_blood_group
                    CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  phone_number      VARCHAR(20) NOT NULL CONSTRAINT chk_patients_phone CHECK (phone_number ~ '^[0-9+ -]{7,20}$'),
  emergency_contact VARCHAR(20) NOT NULL CONSTRAINT chk_patients_emergency CHECK (emergency_contact ~ '^[0-9+ -]{7,20}$'),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Age is not stored: it is derived from dob by patient_age() (a stored age would go stale).

CREATE TABLE IF NOT EXISTS wards (
  ward_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_name      VARCHAR(50) NOT NULL CONSTRAINT uq_wards_name UNIQUE,
  total_capacity INT NOT NULL CONSTRAINT chk_wards_capacity CHECK (total_capacity > 0),
  -- Deliberately redundant: equals the number of ADMITTED rows for the ward.
  -- Maintained by trigger trg_ward_occupancy, audited by view v_ward_consistency.
  occupied_beds  INT NOT NULL DEFAULT 0 CONSTRAINT chk_wards_occupied_nonneg CHECK (occupied_beds >= 0),
  CONSTRAINT chk_wards_occupied_within_capacity CHECK (occupied_beds <= total_capacity)
);

CREATE TABLE IF NOT EXISTS medications (
  med_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  med_name       VARCHAR(100) NOT NULL CONSTRAINT uq_medications_name UNIQUE,
  stock_quantity INT NOT NULL CONSTRAINT chk_medications_stock CHECK (stock_quantity >= 0),
  unit_price     NUMERIC(10,2) NOT NULL CONSTRAINT chk_medications_price CHECK (unit_price > 0)
);

CREATE TABLE IF NOT EXISTS admissions (
  admission_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  ward_id        UUID REFERENCES wards(ward_id) ON DELETE SET NULL,
  doctor_id      UUID REFERENCES users(user_id) ON DELETE SET NULL,
  admission_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  discharge_date TIMESTAMPTZ,
  status         VARCHAR(10) NOT NULL DEFAULT 'ADMITTED'
                 CONSTRAINT chk_admissions_status CHECK (status IN ('ADMITTED','DISCHARGED')),
  CONSTRAINT chk_admissions_discharge_order CHECK (discharge_date IS NULL OR discharge_date >= admission_date),
  CONSTRAINT chk_admissions_status_dates CHECK (
    (status = 'ADMITTED'   AND discharge_date IS NULL) OR
    (status = 'DISCHARGED' AND discharge_date IS NOT NULL))
);

-- embedding: 384-dimension all-MiniLM-L6-v2 vector of "chief_complaint. observation_text"
CREATE TABLE IF NOT EXISTS clinical_notes (
  note_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  doctor_id        UUID REFERENCES users(user_id) ON DELETE SET NULL,
  chief_complaint  TEXT NOT NULL CONSTRAINT chk_notes_complaint CHECK (length(trim(chief_complaint)) > 0),
  observation_text TEXT NOT NULL CONSTRAINT chk_notes_observation CHECK (length(trim(observation_text)) > 0),
  embedding        vector(384),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prescriptions (
  prescription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  doctor_id       UUID REFERENCES users(user_id) ON DELETE SET NULL,
  med_id          UUID NOT NULL REFERENCES medications(med_id) ON DELETE RESTRICT,
  dosage          VARCHAR(50) NOT NULL CONSTRAINT chk_rx_dosage CHECK (length(trim(dosage)) > 0),
  quantity        INT NOT NULL CONSTRAINT chk_rx_quantity CHECK (quantity > 0),
  prescribed_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- clock_timestamp() (not now()) so rows written in one transaction still sort in real order
CREATE TABLE IF NOT EXISTS audit_logs (
  log_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(user_id) ON DELETE SET NULL,
  action_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

COMMENT ON TABLE users          IS 'Staff accounts (DOCTOR or ADMIN)';
COMMENT ON TABLE patients       IS 'Patient registry';
COMMENT ON TABLE wards          IS 'Hospital wards and bed capacity';
COMMENT ON TABLE admissions     IS 'Ternary relationship patient-ward-doctor with dates; one row per stay';
COMMENT ON TABLE clinical_notes IS 'Free-text notes plus their embedding for semantic search';
COMMENT ON TABLE medications    IS 'Pharmacy stock';
COMMENT ON TABLE prescriptions  IS 'Associative entity patient-medication with dosage and quantity';
COMMENT ON TABLE audit_logs     IS 'Who did what, written by triggers and the application';

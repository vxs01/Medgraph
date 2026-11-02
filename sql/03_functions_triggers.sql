-- Business-rule errors use their own SQLSTATE codes so the application can tell them apart:
--   MG001 ward full | MG002 not a doctor | MG003 not found / not active | MG004 not enough stock | MG005 invalid request

-- The application sets app.user_id (set_config(..., true)) at the start of each transaction,
-- so audit triggers can record who acted, even for rows deleted by cascade.
CREATE OR REPLACE FUNCTION current_app_user() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION patient_age(p_dob DATE) RETURNS INT AS $$
  SELECT EXTRACT(YEAR FROM age(current_date, p_dob))::INT;
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------- integrity trigger
CREATE OR REPLACE FUNCTION fn_check_doctor_role() RETURNS trigger AS $$
BEGIN
  IF NEW.doctor_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM users WHERE user_id = NEW.doctor_id AND role = 'DOCTOR') THEN
    RAISE EXCEPTION 'The responsible clinician must be a DOCTOR account' USING ERRCODE = 'MG002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admissions_doctor ON admissions;
CREATE TRIGGER trg_admissions_doctor BEFORE INSERT OR UPDATE OF doctor_id ON admissions
  FOR EACH ROW EXECUTE FUNCTION fn_check_doctor_role();
DROP TRIGGER IF EXISTS trg_notes_doctor ON clinical_notes;
CREATE TRIGGER trg_notes_doctor BEFORE INSERT OR UPDATE OF doctor_id ON clinical_notes
  FOR EACH ROW EXECUTE FUNCTION fn_check_doctor_role();
DROP TRIGGER IF EXISTS trg_rx_doctor ON prescriptions;
CREATE TRIGGER trg_rx_doctor BEFORE INSERT OR UPDATE OF doctor_id ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION fn_check_doctor_role();

-- ---------------------------------------------------------------- bed counts follow admissions
CREATE OR REPLACE FUNCTION fn_sync_ward_occupancy() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'ADMITTED' AND NEW.ward_id IS NOT NULL THEN
      UPDATE wards SET occupied_beds = occupied_beds + 1 WHERE ward_id = NEW.ward_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'ADMITTED' AND OLD.ward_id IS NOT NULL THEN
      UPDATE wards SET occupied_beds = occupied_beds - 1 WHERE ward_id = OLD.ward_id;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.status = 'ADMITTED' AND NEW.status = 'DISCHARGED' THEN
    IF OLD.ward_id IS NOT NULL THEN
      UPDATE wards SET occupied_beds = occupied_beds - 1 WHERE ward_id = OLD.ward_id;
    END IF;
    INSERT INTO audit_logs(user_id, action_type, description)
    VALUES (COALESCE(current_app_user(), NEW.doctor_id), 'DISCHARGE', 'Discharged patient ' || NEW.patient_id);
  ELSIF OLD.status = 'ADMITTED' AND NEW.status = 'ADMITTED' AND OLD.ward_id IS DISTINCT FROM NEW.ward_id THEN
    IF OLD.ward_id IS NOT NULL THEN
      UPDATE wards SET occupied_beds = occupied_beds - 1 WHERE ward_id = OLD.ward_id;
    END IF;
    IF NEW.ward_id IS NOT NULL THEN
      UPDATE wards SET occupied_beds = occupied_beds + 1 WHERE ward_id = NEW.ward_id;
    END IF;
    INSERT INTO audit_logs(user_id, action_type, description)
    VALUES (COALESCE(current_app_user(), NEW.doctor_id), 'TRANSFER', 'Transferred patient ' || NEW.patient_id || ' to another ward');
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ward_occupancy ON admissions;
CREATE TRIGGER trg_ward_occupancy AFTER INSERT OR UPDATE OR DELETE ON admissions
  FOR EACH ROW EXECUTE FUNCTION fn_sync_ward_occupancy();

-- ---------------------------------------------------------------- pharmacy stock follows prescriptions
-- Locks the medication row first, so two prescriptions for the last units cannot both succeed.
CREATE OR REPLACE FUNCTION fn_decrement_stock() RETURNS trigger AS $$
DECLARE v_stock INT;
BEGIN
  SELECT stock_quantity INTO v_stock FROM medications WHERE med_id = NEW.med_id FOR UPDATE;
  IF v_stock IS NOT NULL AND v_stock < NEW.quantity THEN
    RAISE EXCEPTION 'Only % units in stock', v_stock USING ERRCODE = 'MG004';
  END IF;
  UPDATE medications SET stock_quantity = stock_quantity - NEW.quantity WHERE med_id = NEW.med_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rx_stock ON prescriptions;
CREATE TRIGGER trg_rx_stock BEFORE INSERT ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION fn_decrement_stock();

CREATE OR REPLACE FUNCTION fn_restore_stock() RETURNS trigger AS $$
BEGIN
  UPDATE medications SET stock_quantity = stock_quantity + OLD.quantity WHERE med_id = OLD.med_id;
  RETURN OLD;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rx_restore ON prescriptions;
CREATE TRIGGER trg_rx_restore AFTER DELETE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION fn_restore_stock();

-- ---------------------------------------------------------------- audit trail
CREATE OR REPLACE FUNCTION fn_audit_insert() RETURNS trigger AS $$
DECLARE v_name TEXT;
BEGIN
  SELECT first_name || ' ' || last_name INTO v_name FROM patients WHERE patient_id = NEW.patient_id;
  INSERT INTO audit_logs(user_id, action_type, description)
  VALUES (COALESCE(current_app_user(), NEW.doctor_id), 'INSERT_' || upper(TG_TABLE_NAME),
          'New ' || TG_TABLE_NAME || ' record for ' || COALESCE(v_name, NEW.patient_id::text));
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_admissions ON admissions;
CREATE TRIGGER trg_audit_admissions AFTER INSERT ON admissions
  FOR EACH ROW EXECUTE FUNCTION fn_audit_insert();
DROP TRIGGER IF EXISTS trg_audit_notes ON clinical_notes;
CREATE TRIGGER trg_audit_notes AFTER INSERT ON clinical_notes
  FOR EACH ROW EXECUTE FUNCTION fn_audit_insert();
DROP TRIGGER IF EXISTS trg_audit_rx ON prescriptions;
CREATE TRIGGER trg_audit_rx AFTER INSERT ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION fn_audit_insert();

CREATE OR REPLACE FUNCTION fn_audit_patient_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs(user_id, action_type, description)
    VALUES (current_app_user(), 'PATIENT_UPDATED', 'Updated patient ' || NEW.first_name || ' ' || NEW.last_name || ' (' || NEW.patient_id || ')');
    RETURN NEW;
  END IF;
  INSERT INTO audit_logs(user_id, action_type, description)
  VALUES (current_app_user(), 'PATIENT_DELETED', 'Deleted patient ' || OLD.first_name || ' ' || OLD.last_name || ' (' || OLD.patient_id || ') and their records');
  RETURN OLD;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_patients ON patients;
CREATE TRIGGER trg_audit_patients AFTER UPDATE OR DELETE ON patients
  FOR EACH ROW EXECUTE FUNCTION fn_audit_patient_change();

-- ---------------------------------------------------------------- function: admit
-- Locks the ward row, so two concurrent admissions cannot both take the last bed.
CREATE OR REPLACE FUNCTION admit_patient(p_patient UUID, p_ward UUID, p_doctor UUID)
RETURNS UUID AS $$
DECLARE v_cap INT; v_occ INT; v_id UUID;
BEGIN
  SELECT total_capacity, occupied_beds INTO v_cap, v_occ FROM wards WHERE ward_id = p_ward FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ward not found' USING ERRCODE = 'MG003';
  END IF;
  IF v_occ >= v_cap THEN
    RAISE EXCEPTION 'That ward is full' USING ERRCODE = 'MG001';
  END IF;
  INSERT INTO admissions(patient_id, ward_id, doctor_id) VALUES (p_patient, p_ward, p_doctor)
  RETURNING admission_id INTO v_id;
  RETURN v_id;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------- procedures (CALL ...)
CREATE OR REPLACE PROCEDURE discharge_patient(p_admission UUID)
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE admissions SET status = 'DISCHARGED', discharge_date = now()
   WHERE admission_id = p_admission AND status = 'ADMITTED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active admission with that id' USING ERRCODE = 'MG003';
  END IF;
END $$;

-- Locks BOTH wards in ward_id order, so two opposite transfers (A to B and B to A)
-- can never wait on each other. See scripts/concurrency-demo.mjs.
CREATE OR REPLACE PROCEDURE transfer_patient(p_admission UUID, p_new_ward UUID)
LANGUAGE plpgsql AS $$
DECLARE v_old UUID; v_cap INT; v_occ INT;
BEGIN
  SELECT ward_id INTO v_old FROM admissions
   WHERE admission_id = p_admission AND status = 'ADMITTED' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active admission with that id' USING ERRCODE = 'MG003';
  END IF;
  IF v_old IS NOT DISTINCT FROM p_new_ward THEN
    RAISE EXCEPTION 'The patient is already in that ward' USING ERRCODE = 'MG005';
  END IF;

  PERFORM ward_id FROM wards WHERE ward_id IN (v_old, p_new_ward) ORDER BY ward_id FOR UPDATE;

  SELECT total_capacity, occupied_beds INTO v_cap, v_occ FROM wards WHERE ward_id = p_new_ward;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ward not found' USING ERRCODE = 'MG003';
  END IF;
  IF v_occ >= v_cap THEN
    RAISE EXCEPTION 'That ward is full' USING ERRCODE = 'MG001';
  END IF;
  UPDATE admissions SET ward_id = p_new_ward WHERE admission_id = p_admission;
END $$;

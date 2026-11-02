import { NextResponse } from 'next/server';
import { query, withUser } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { dbError } from '@/lib/errors';
import { isUuid } from '@/lib/validate';

const notFound = () => NextResponse.json({ error: 'Patient not found.' }, { status: 404 });

export async function GET(_req, { params }) {
  const { session, error } = await authorize();
  if (error) return error;
  if (!isUuid(params.id)) return notFound();

  const patient = (await query(
    `SELECT patient_id, first_name, last_name, dob, patient_age(dob) AS age, gender, blood_group,
            phone_number, emergency_contact, created_at FROM patients WHERE patient_id = $1`, [params.id])).rows[0];
  if (!patient) return notFound();

  const current = (await query('SELECT admission_id, ward_name, admission_date FROM v_active_admissions WHERE patient_id = $1', [params.id])).rows[0] || null;
  // Admins manage beds and stock; clinical notes are for doctors only, so they are left out of an admin's timeline.
  const timeline = (await query(
    `SELECT t.event_time, t.event_type, t.summary, t.note_id, u.full_name AS doctor_name
     FROM v_patient_timeline t LEFT JOIN users u ON u.user_id = t.doctor_id
     WHERE t.patient_id = $1 AND ($2::text = 'DOCTOR' OR t.event_type <> 'NOTE')
     ORDER BY t.event_time DESC`, [params.id, session.role])).rows;
  return NextResponse.json({ patient, current, timeline });
}

export async function PATCH(req, { params }) {
  const { session, error } = await authorize();
  if (error) return error;
  if (!isUuid(params.id)) return notFound();
  const b = await req.json().catch(() => ({}));
  try {
    const n = await withUser(session.sub, async (c) =>
      (await c.query(
        `UPDATE patients SET first_name=$2, last_name=$3, dob=$4, gender=$5, blood_group=$6, phone_number=$7, emergency_contact=$8
         WHERE patient_id = $1`,
        [params.id, b.first_name, b.last_name, b.dob, b.gender, b.blood_group, b.phone_number, b.emergency_contact]
      )).rowCount
    );
    return n ? NextResponse.json({ ok: true }) : notFound();
  } catch (e) {
    return dbError(e);
  }
}

// Admin only. ON DELETE CASCADE removes the patient's admissions, notes and prescriptions;
// triggers free the bed, return the stock and write the audit row.
export async function DELETE(_req, { params }) {
  const { session, error } = await authorize(['ADMIN']);
  if (error) return error;
  if (!isUuid(params.id)) return notFound();
  try {
    const n = await withUser(session.sub, async (c) => (await c.query('DELETE FROM patients WHERE patient_id = $1', [params.id])).rowCount);
    return n ? NextResponse.json({ ok: true }) : notFound();
  } catch (e) {
    return dbError(e);
  }
}

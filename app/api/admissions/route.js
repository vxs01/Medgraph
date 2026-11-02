import { NextResponse } from 'next/server';
import { query, withUser } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { dbError } from '@/lib/errors';
import { isUuid } from '@/lib/validate';

export async function GET(req) {
  const { error } = await authorize();
  if (error) return error;
  const history = req.nextUrl.searchParams.get('history') === '1';
  const { rows } = history
    ? await query(
        `SELECT a.admission_id, p.first_name || ' ' || p.last_name AS patient_name, w.ward_name,
                u.full_name AS doctor_name, a.admission_date, a.discharge_date, a.status
         FROM admissions a
         JOIN patients p ON p.patient_id = a.patient_id
         LEFT JOIN wards w ON w.ward_id = a.ward_id
         LEFT JOIN users u ON u.user_id = a.doctor_id
         ORDER BY a.admission_date DESC LIMIT 100`)
    : await query('SELECT * FROM v_active_admissions ORDER BY admission_date DESC');
  return NextResponse.json(rows);
}

// Calls the admit_patient() function, which locks the ward row and refuses when no bed is free.
export async function POST(req) {
  const { session, error } = await authorize();
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const doctorId = session.role === 'DOCTOR' ? session.sub : b.doctor_id;
  if (![b.patient_id, b.ward_id, doctorId].every(isUuid))
    return NextResponse.json({ error: 'Choose a patient, a ward and a doctor.' }, { status: 400 });
  try {
    const id = await withUser(session.sub, async (c) =>
      (await c.query('SELECT admit_patient($1, $2, $3) AS id', [b.patient_id, b.ward_id, doctorId])).rows[0].id);
    return NextResponse.json({ admission_id: id }, { status: 201 });
  } catch (e) {
    return dbError(e);
  }
}

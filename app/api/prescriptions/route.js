import { NextResponse } from 'next/server';
import { query, withUser } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { dbError } from '@/lib/errors';
import { isUuid, intOrNull } from '@/lib/validate';

export async function GET() {
  const { error } = await authorize(['DOCTOR']);
  if (error) return error;
  const { rows } = await query(
    `SELECT rx.prescription_id, p.first_name || ' ' || p.last_name AS patient_name, m.med_name, rx.dosage, rx.quantity,
            rx.quantity * m.unit_price AS total_cost, u.full_name AS doctor_name, rx.prescribed_date
     FROM prescriptions rx
     JOIN patients p ON p.patient_id = rx.patient_id
     JOIN medications m ON m.med_id = rx.med_id
     LEFT JOIN users u ON u.user_id = rx.doctor_id
     ORDER BY rx.prescribed_date DESC LIMIT 100`);
  return NextResponse.json(rows);
}

// One transaction: lock the medication row, insert the prescription (the trigger takes the stock and
// refuses with MG004 when there is not enough), and price it from the locked row.
export async function POST(req) {
  const { session, error } = await authorize(['DOCTOR']);
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const quantity = intOrNull(b.quantity);
  if (!isUuid(b.patient_id) || !isUuid(b.med_id) || !String(b.dosage || '').trim() || !(quantity > 0))
    return NextResponse.json({ error: 'Choose a patient and medication, and enter a dosage and a quantity of at least 1.' }, { status: 400 });
  try {
    const out = await withUser(session.sub, async (c) => {
      const med = (await c.query('SELECT unit_price FROM medications WHERE med_id = $1 FOR UPDATE', [b.med_id])).rows[0];
      if (!med) throw Object.assign(new Error('Medication not found'), { code: 'MG003' });
      const rx = (await c.query(
        `INSERT INTO prescriptions(patient_id, doctor_id, med_id, dosage, quantity) VALUES ($1, $2, $3, $4, $5) RETURNING prescription_id`,
        [b.patient_id, session.sub, b.med_id, String(b.dosage).trim(), quantity])).rows[0];
      return { ...rx, total_cost: Number(med.unit_price) * quantity };
    });
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    return dbError(e);
  }
}

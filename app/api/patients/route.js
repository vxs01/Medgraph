import { NextResponse } from 'next/server';
import { query, withUser } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { dbError } from '@/lib/errors';

export async function GET(req) {
  const { error } = await authorize();
  if (error) return error;
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const bg = req.nextUrl.searchParams.get('blood_group') || '';
  const { rows } = await query(
    `SELECT p.patient_id, p.first_name, p.last_name, patient_age(p.dob) AS age, p.gender, p.blood_group, p.phone_number,
            EXISTS (SELECT 1 FROM admissions a WHERE a.patient_id = p.patient_id AND a.status = 'ADMITTED') AS admitted
     FROM patients p
     WHERE ($1::text = '' OR p.first_name ILIKE '%' || $1::text || '%' OR p.last_name ILIKE '%' || $1::text || '%')
       AND ($2::text = '' OR p.blood_group = $2::text)
     ORDER BY p.last_name, p.first_name LIMIT 200`,
    [q, bg]
  );
  return NextResponse.json(rows);
}

export async function POST(req) {
  const { session, error } = await authorize();
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  try {
    const row = await withUser(session.sub, async (c) =>
      (await c.query(
        `INSERT INTO patients(first_name,last_name,dob,gender,blood_group,phone_number,emergency_contact)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING patient_id`,
        [b.first_name, b.last_name, b.dob, b.gender, b.blood_group, b.phone_number, b.emergency_contact]
      )).rows[0]
    );
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return dbError(e);
  }
}

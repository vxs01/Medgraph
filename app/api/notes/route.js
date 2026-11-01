import { NextResponse } from 'next/server';
import { query, withUser } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { dbError } from '@/lib/errors';
import { isUuid } from '@/lib/validate';
import { embed, toVector } from '@/lib/embed.mjs';

export async function GET(req) {
  const { session, error } = await authorize(['DOCTOR']);
  if (error) return error;
  const pid = req.nextUrl.searchParams.get('patient_id');
  if (pid && !isUuid(pid)) return NextResponse.json([]);
  const { rows } = await query(
    `SELECT n.note_id, n.patient_id, p.first_name || ' ' || p.last_name AS patient_name, u.full_name AS doctor_name,
            n.chief_complaint, n.observation_text, n.created_at, n.doctor_id = $2 AS mine
     FROM clinical_notes n
     JOIN patients p ON p.patient_id = n.patient_id
     LEFT JOIN users u ON u.user_id = n.doctor_id
     WHERE ($1::uuid IS NULL OR n.patient_id = $1::uuid)
     ORDER BY n.created_at DESC LIMIT 50`, [pid || null, session.sub]);
  return NextResponse.json(rows);
}

// The note text is embedded before it is stored, so it is searchable by meaning straight away.
export async function POST(req) {
  const { session, error } = await authorize(['DOCTOR']);
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const complaint = String(b.chief_complaint || '').trim();
  const observation = String(b.observation_text || '').trim();
  if (!isUuid(b.patient_id) || !complaint || !observation)
    return NextResponse.json({ error: 'Choose a patient and fill in the complaint and observations.' }, { status: 400 });
  try {
    const vector = toVector(await embed(`${complaint}. ${observation}`));
    const row = await withUser(session.sub, async (c) =>
      (await c.query(
        `INSERT INTO clinical_notes(patient_id, doctor_id, chief_complaint, observation_text, embedding)
         VALUES ($1, $2, $3, $4, $5::vector) RETURNING note_id`,
        [b.patient_id, session.sub, complaint, observation, vector]
      )).rows[0]);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return dbError(e);
  }
}

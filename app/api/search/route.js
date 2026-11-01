import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { dbError } from '@/lib/errors';
import { isUuid, intOrNull } from '@/lib/validate';
import { embed, toVector } from '@/lib/embed.mjs';
import { buildSearch, orQuery } from '@/lib/search';

// body: { query, mode: semantic | keyword | hybrid, k, like (note id), minAge, maxAge, gender, admittedOnly, since }
export async function POST(req) {
  const { session, error } = await authorize(['DOCTOR']);
  if (error) return error;
  const b = await req.json().catch(() => ({}));

  const mode = ['semantic', 'keyword', 'hybrid'].includes(b.mode) ? b.mode : 'semantic';
  const k = Math.min(Math.max(intOrNull(b.k) ?? 5, 1), 20);
  const text = String(b.query || '').trim().slice(0, 1000);
  const likeId = b.like || null;
  if (likeId && !isUuid(likeId)) return NextResponse.json({ error: 'Unknown note.' }, { status: 400 });
  if (!likeId && !text) return NextResponse.json({ error: 'Describe the case you want to find.' }, { status: 400 });

  const filters = {
    minAge: intOrNull(b.minAge),
    maxAge: intOrNull(b.maxAge),
    gender: ['M', 'F', 'O'].includes(b.gender) ? b.gender : null,
    admittedOnly: b.admittedOnly === true,
    since: /^\d{4}-\d{2}-\d{2}$/.test(b.since || '') ? b.since : null,
  };

  try {
    const needsVector = !likeId && mode !== 'keyword';
    const vector = needsVector ? toVector(await embed(text)) : null;
    const { sql, params } = buildSearch({ mode, vector, text: mode === 'hybrid' ? orQuery(text) : text, likeId, k, filters });
    const { rows } = await query(sql, params);

    let source = null;
    if (likeId) {
      source = (await query(
        `SELECT n.chief_complaint, p.first_name || ' ' || p.last_name AS patient_name
         FROM clinical_notes n JOIN patients p ON p.patient_id = n.patient_id WHERE n.note_id = $1`, [likeId])).rows[0] || null;
    }
    await query(`INSERT INTO audit_logs(user_id, action_type, description) VALUES ($1, 'SEARCH', $2)`, [
      session.sub, likeId ? 'Searched for cases similar to a note' : `${mode} search: ${text.slice(0, 200)}`,
    ]);
    return NextResponse.json({ mode: likeId ? 'like' : mode, results: rows, source });
  } catch (e) {
    return dbError(e);
  }
}

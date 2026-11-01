import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { isUuid } from '@/lib/validate';

// A doctor can delete only their own notes.
export async function DELETE(_req, { params }) {
  const { session, error } = await authorize(['DOCTOR']);
  if (error) return error;
  const { rowCount } = isUuid(params.id)
    ? await query('DELETE FROM clinical_notes WHERE note_id = $1 AND doctor_id = $2', [params.id, session.sub])
    : { rowCount: 0 };
  return rowCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'You can only delete your own notes.' }, { status: 403 });
}

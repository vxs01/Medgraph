import { NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { dbError } from '@/lib/errors';
import { isUuid } from '@/lib/validate';

// Cancelling a prescription deletes it; the trigger puts the units back in stock.
export async function DELETE(_req, { params }) {
  const { session, error } = await authorize(['DOCTOR']);
  if (error) return error;
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Prescription not found.' }, { status: 404 });
  try {
    const n = await withUser(session.sub, async (c) => (await c.query('DELETE FROM prescriptions WHERE prescription_id = $1', [params.id])).rowCount);
    return n ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Prescription not found.' }, { status: 404 });
  } catch (e) {
    return dbError(e);
  }
}

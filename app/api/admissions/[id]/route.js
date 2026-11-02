import { NextResponse } from 'next/server';
import { withUser } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { dbError } from '@/lib/errors';
import { isUuid } from '@/lib/validate';

// body: { action: 'discharge' }  or  { action: 'transfer', ward_id }
// Both call stored procedures (CALL ...); triggers keep the bed counts and audit log correct.
export async function PATCH(req, { params }) {
  const { session, error } = await authorize();
  if (error) return error;
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Admission not found.' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  try {
    await withUser(session.sub, async (c) => {
      if (b.action === 'discharge') return c.query('CALL discharge_patient($1)', [params.id]);
      if (b.action === 'transfer' && isUuid(b.ward_id)) return c.query('CALL transfer_patient($1, $2)', [params.id, b.ward_id]);
      throw Object.assign(new Error('Choose discharge, or transfer with a ward.'), { code: 'MG005' });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return dbError(e);
  }
}

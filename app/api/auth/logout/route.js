import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

export async function POST() {
  const s = await getSession();
  if (s) await query(`INSERT INTO audit_logs(user_id, action_type, description) VALUES ($1, 'LOGOUT', 'Signed out')`, [s.sub]);
  const res = NextResponse.json({ ok: true });
  res.cookies.set('session', '', { path: '/', maxAge: 0 });
  return res;
}

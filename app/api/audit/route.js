import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authorize } from '@/lib/auth';

export async function GET(req) {
  const { error } = await authorize(['ADMIN']);
  if (error) return error;
  const type = req.nextUrl.searchParams.get('type') || '';
  const [rows, types] = await Promise.all([
    query(
      `SELECT l.log_id, l.logged_at, COALESCE(u.full_name, 'not signed in') AS user_name, l.action_type, l.description
       FROM audit_logs l LEFT JOIN users u ON u.user_id = l.user_id
       WHERE ($1::text = '' OR l.action_type = $1::text) ORDER BY l.logged_at DESC LIMIT 200`, [type]),
    query('SELECT DISTINCT action_type FROM audit_logs ORDER BY action_type'),
  ]);
  return NextResponse.json({ rows: rows.rows, types: types.rows.map((r) => r.action_type) });
}

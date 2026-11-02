import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authorize } from '@/lib/auth';

export async function GET() {
  const { error } = await authorize();
  if (error) return error;
  return NextResponse.json((await query(`SELECT user_id, full_name FROM users WHERE role = 'DOCTOR' ORDER BY full_name`)).rows);
}

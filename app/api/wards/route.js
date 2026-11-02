import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authorize } from '@/lib/auth';

export async function GET() {
  const { error } = await authorize();
  if (error) return error;
  return NextResponse.json((await query('SELECT * FROM v_ward_occupancy ORDER BY ward_name')).rows);
}

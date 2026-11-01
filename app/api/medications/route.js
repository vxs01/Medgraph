import { NextResponse } from 'next/server';
import { query, withUser } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { dbError } from '@/lib/errors';
import { intOrNull } from '@/lib/validate';

export async function GET() {
  const { error } = await authorize();
  if (error) return error;
  return NextResponse.json((await query('SELECT med_id, med_name, stock_quantity, unit_price FROM medications ORDER BY med_name')).rows);
}

// Admin only. Upsert: a new name is inserted; an existing name has the quantity ADDED to its stock.
export async function POST(req) {
  const { session, error } = await authorize(['ADMIN']);
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const quantity = intOrNull(b.quantity);
  if (!String(b.med_name || '').trim() || quantity === null || quantity < 0)
    return NextResponse.json({ error: 'Enter a medication name and a quantity of 0 or more.' }, { status: 400 });
  try {
    const row = await withUser(session.sub, async (c) =>
      (await c.query(
        `INSERT INTO medications(med_name, stock_quantity, unit_price) VALUES ($1, $2, $3)
         ON CONFLICT (med_name) DO UPDATE
           SET stock_quantity = medications.stock_quantity + EXCLUDED.stock_quantity, unit_price = EXCLUDED.unit_price
         RETURNING med_name, stock_quantity`,
        [String(b.med_name).trim(), quantity, b.unit_price]
      )).rows[0]
    );
    return NextResponse.json(row);
  } catch (e) {
    return dbError(e);
  }
}

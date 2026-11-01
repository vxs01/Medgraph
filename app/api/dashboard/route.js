import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authorize } from '@/lib/auth';

export async function GET() {
  const { session, error } = await authorize();
  if (error) return error;
  const [counts, wards, workload, topMeds, lowStock, perDay, consistency] = await Promise.all([
    query(`SELECT (SELECT COUNT(*) FROM patients)::int AS patients,
                  (SELECT COUNT(*) FROM admissions WHERE status = 'ADMITTED')::int AS admitted,
                  (SELECT COUNT(*) FROM clinical_notes)::int AS notes,
                  (SELECT COUNT(*) FROM prescriptions)::int AS prescriptions`),
    query('SELECT * FROM v_ward_occupancy ORDER BY ward_name'),
    query(`SELECT full_name, active_patients, notes_written, prescriptions_written,
                  RANK() OVER (ORDER BY notes_written DESC) AS rank
           FROM v_doctor_workload ORDER BY rank, full_name`),
    query(`SELECT m.med_name, SUM(rx.quantity)::int AS units,
                  ROUND(100.0 * SUM(rx.quantity) / SUM(SUM(rx.quantity)) OVER (), 1) AS percent
           FROM prescriptions rx JOIN medications m ON m.med_id = rx.med_id
           GROUP BY m.med_name ORDER BY units DESC LIMIT 5`),
    query('SELECT med_name, stock_quantity FROM medications WHERE stock_quantity < 100 ORDER BY stock_quantity'),
    // recursive CTE builds the 7 calendar days so days without admissions still appear as 0
    query(`WITH RECURSIVE days(day) AS (
             SELECT current_date - 6 UNION ALL SELECT day + 1 FROM days WHERE day < current_date)
           SELECT to_char(d.day, 'Dy DD') AS label, COUNT(a.admission_id)::int AS admissions
           FROM days d LEFT JOIN admissions a ON a.admission_date::date = d.day
           GROUP BY d.day ORDER BY d.day`),
    session.role === 'ADMIN' ? query('SELECT ward_name, recorded, actual FROM v_ward_consistency WHERE NOT consistent') : { rows: [] },
  ]);
  return NextResponse.json({
    counts: counts.rows[0], wards: wards.rows, workload: workload.rows, topMeds: topMeds.rows,
    lowStock: lowStock.rows, perDay: perDay.rows, inconsistentWards: consistency.rows,
  });
}

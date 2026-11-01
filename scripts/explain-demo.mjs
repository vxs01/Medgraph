// Unit 3 demo: how indexes change query plans. Generates 50,000 patients and 5,000 notes (random
// vectors) INSIDE a transaction, prints plans with and without indexes, then rolls everything back.
import pg from 'pg';
import { loadEnv } from './env.mjs';

loadEnv();
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

async function plan(label, sql, settings = []) {
  for (const s of settings) await c.query(`SET LOCAL ${s}`);
  const rows = (await c.query(`EXPLAIN (ANALYZE, BUFFERS OFF, TIMING ON) ${sql}`)).rows.map((r) => r['QUERY PLAN']);
  for (const s of settings) await c.query(`RESET ${s.split(/[ =]/)[0]}`);
  const scan = rows.find((l) => /(Seq Scan|Index Scan|Index Only Scan|Bitmap Heap Scan)/.test(l)) || rows[0];
  const time = rows.find((l) => l.startsWith('Execution Time')) || '';
  console.log(`  ${label.padEnd(34)} ${scan.trim().replace(/\s+\(cost.*$/, '').padEnd(62)} ${time}`);
}

await c.query('BEGIN');
try {
  console.log('Generating 50,000 patients ...');
  await c.query(`INSERT INTO patients(first_name,last_name,dob,gender,blood_group,phone_number,emergency_contact)
                 SELECT 'First' || g, 'Last' || (g % 5000), DATE '1940-01-01' + (g % 25000), 'M', 'O+', '+91 90000 00001', '+91 90000 00002'
                 FROM generate_series(1, 50000) g`);
  await c.query('ANALYZE patients');

  console.log('\nB-tree expression index on lower(last_name), about 10 matching rows out of 50,000:');
  const q1 = `SELECT * FROM patients WHERE lower(last_name) = 'last42'`;
  await plan('index disabled (forced seq scan)', q1, ['enable_indexscan = off', 'enable_bitmapscan = off']);
  await plan('index available', q1);

  console.log('\nPartial index (only ADMITTED rows) is tiny compared with the whole admissions table:');
  const size = await c.query(`SELECT pg_size_pretty(pg_relation_size('idx_admissions_active_ward')) AS partial,
                                     pg_size_pretty(pg_relation_size('idx_admissions_doctor'))       AS full_index`);
  console.log(`  partial index ${size.rows[0].partial}   vs   full index on a different column ${size.rows[0].full_index}`);

  console.log('\nGenerating 5,000 notes with random 384-dimension vectors ...');
  const doc = (await c.query(`SELECT user_id FROM users WHERE role='DOCTOR' LIMIT 1`)).rows[0].user_id;
  const pid = (await c.query(`SELECT patient_id FROM patients LIMIT 1`)).rows[0].patient_id;
  await c.query(
    `INSERT INTO clinical_notes(patient_id,doctor_id,chief_complaint,observation_text,embedding)
     SELECT $1, $2, 'benchmark ' || g, 'generated row ' || g,
            (SELECT array_agg(random()::real) FROM generate_series(1,384) WHERE g IS NOT NULL)::vector
     FROM generate_series(1, 5000) g`, [pid, doc]);
  await c.query('ANALYZE clinical_notes');
  const probe = (await c.query(`SELECT embedding::text AS v FROM clinical_notes OFFSET 100 LIMIT 1`)).rows[0].v;

  console.log('\nNearest 5 notes by cosine distance:');
  const q2 = `SELECT note_id FROM clinical_notes ORDER BY embedding <=> '${probe}'::vector LIMIT 5`;
  await plan('exact: scan every row and sort', q2, ['enable_indexscan = off']);
  await plan('approximate: HNSW index', q2, ['enable_seqscan = off']);
  console.log('  (HNSW trades a little accuracy for speed; random vectors are the worst case for it.)');
} finally {
  await c.query('ROLLBACK');
  await c.end();
  console.log('\nRolled back: no data was kept.');
}

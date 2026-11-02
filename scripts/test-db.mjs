// Database test suite. Every test runs inside BEGIN ... ROLLBACK, so no data is changed.
//   npm run test:db              constraints, triggers, procedures, views, indexes, query files
//   npm run test:db -- --model   also checks semantic search quality (downloads the model once)
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from './env.mjs';
import { runFile } from './sqlfile.mjs';

loadEnv();
const sqlDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const results = [];
async function test(id, name, fn) {
  await client.query('BEGIN');
  try {
    await fn();
    results.push([id, name, 'PASS', '']);
  } catch (e) {
    results.push([id, name, 'FAIL', e.message.split('\n')[0]]);
  } finally {
    await client.query('ROLLBACK');
  }
}

// The statement must fail. expect = { code?, text? } is matched against the PostgreSQL error.
async function rejects(sql, params, expect = {}) {
  await client.query('SAVEPOINT s');
  try {
    await client.query(sql, params);
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT s');
    if (expect.code && e.code !== expect.code) throw new Error(`expected ${expect.code}, got ${e.code}: ${e.message}`);
    if (expect.text && !`${e.message} ${e.constraint || ''}`.includes(expect.text)) throw new Error(`wrong error: ${e.message}`);
    return;
  }
  throw new Error('statement was accepted but should have been rejected');
}
const one = async (sql, params) => (await client.query(sql, params)).rows[0];
const eq = (actual, expected, what) => {
  if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
};

const doctor = await one(`SELECT user_id FROM users WHERE role='DOCTOR' ORDER BY email LIMIT 1`);
const admin = await one(`SELECT user_id FROM users WHERE role='ADMIN' LIMIT 1`);
if (!doctor || !admin) {
  console.error('No users found. Run: npm run db:seed');
  process.exit(1);
}
const mkPatient = async (first = 'T') =>
  (await one(
    `INSERT INTO patients(first_name,last_name,dob,gender,blood_group,phone_number,emergency_contact)
     VALUES ($1,'Test','1990-01-01','M','O+','+91 90000 00001','+91 90000 00002') RETURNING patient_id`, [first])).patient_id;
const mkWard = async (cap) =>
  (await one(`INSERT INTO wards(ward_name,total_capacity) VALUES ('T-' || gen_random_uuid(), $1) RETURNING ward_id`, [cap])).ward_id;
const mkMed = async (stock) =>
  (await one(`INSERT INTO medications(med_name,stock_quantity,unit_price) VALUES ('T-' || gen_random_uuid(), $1, 2) RETURNING med_id`, [stock])).med_id;
const beds = async (ward) => (await one('SELECT occupied_beds FROM wards WHERE ward_id=$1', [ward])).occupied_beds;
const stock = async (med) => (await one('SELECT stock_quantity FROM medications WHERE med_id=$1', [med])).stock_quantity;

// ------------------------------------------------------------------ constraints
await test('T01', 'Occupied beds cannot exceed ward capacity', () =>
  rejects(`INSERT INTO wards(ward_name,total_capacity,occupied_beds) VALUES ('X',5,9)`, [], { text: 'chk_wards_occupied_within_capacity' }));
await test('T02', 'Invalid blood group is rejected', () =>
  rejects(`INSERT INTO patients(first_name,last_name,dob,gender,blood_group,phone_number,emergency_contact)
           VALUES ('A','B','2000-01-01','M','Z+','+91 90000 00001','+91 90000 00002')`, [], { text: 'chk_patients_blood_group' }));
await test('T03', 'Malformed phone number is rejected', () =>
  rejects(`INSERT INTO patients(first_name,last_name,dob,gender,blood_group,phone_number,emergency_contact)
           VALUES ('A','B','2000-01-01','M','O+','abc','+91 90000 00002')`, [], { text: 'chk_patients_phone' }));
await test('T04', 'Negative stock and zero price are rejected', async () => {
  await rejects(`INSERT INTO medications(med_name,stock_quantity,unit_price) VALUES ('Bad',-1,1)`, [], { text: 'chk_medications_stock' });
  await rejects(`INSERT INTO medications(med_name,stock_quantity,unit_price) VALUES ('Bad2',1,0)`, [], { text: 'chk_medications_price' });
});
await test('T05', 'Duplicate email and invalid role are rejected', async () => {
  const u = await one('SELECT email FROM users LIMIT 1');
  await rejects(`INSERT INTO users(full_name,email,password_hash,role) VALUES ('X',$1,'h','DOCTOR')`, [u.email], { code: '23505' });
  await rejects(`INSERT INTO users(full_name,email,password_hash,role) VALUES ('X','x@y.zz','h','NURSE')`, [], { text: 'chk_users_role' });
});
await test('T06', 'Foreign key blocks a note for an unknown patient', () =>
  rejects(`INSERT INTO clinical_notes(patient_id,doctor_id,chief_complaint,observation_text) VALUES (gen_random_uuid(),$1,'a','b')`, [doctor.user_id], { code: '23503' }));
await test('T07', 'Discharge cannot precede admission; status must match dates', async () => {
  const p = await mkPatient(); const w = await mkWard(2);
  await rejects(`INSERT INTO admissions(patient_id,ward_id,doctor_id,admission_date,discharge_date,status)
                 VALUES ($1,$2,$3, now(), now() - interval '1 day', 'DISCHARGED')`, [p, w, doctor.user_id], { text: 'chk_admissions_discharge_order' });
  await rejects(`INSERT INTO admissions(patient_id,ward_id,doctor_id,status) VALUES ($1,$2,$3,'DISCHARGED')`, [p, w, doctor.user_id], { text: 'chk_admissions_status_dates' });
});
await test('T08', 'Prescription quantity limit added later with ALTER TABLE', async () => {
  const p = await mkPatient(); const m = await mkMed(5000);
  await rejects(`INSERT INTO prescriptions(patient_id,doctor_id,med_id,dosage,quantity) VALUES ($1,$2,$3,'x',1001)`, [p, doctor.user_id, m], { text: 'chk_rx_quantity_max' });
});

// ------------------------------------------------------------------ triggers
await test('T09', 'Only DOCTOR accounts can be the responsible doctor', async () => {
  const p = await mkPatient(); const w = await mkWard(2);
  await rejects(`INSERT INTO admissions(patient_id,ward_id,doctor_id) VALUES ($1,$2,$3)`, [p, w, admin.user_id], { code: 'MG002' });
});
await test('T10', 'Admit and discharge keep occupied_beds in step', async () => {
  const p = await mkPatient(); const w = await mkWard(2);
  const { id } = await one('SELECT admit_patient($1,$2,$3) AS id', [p, w, doctor.user_id]);
  eq(await beds(w), 1, 'beds after admit');
  await client.query('CALL discharge_patient($1)', [id]);
  eq(await beds(w), 0, 'beds after discharge');
});
await test('T11', 'Admitting into a full ward fails with MG001', async () => {
  const w = await mkWard(1); const a = await mkPatient('A'); const b = await mkPatient('B');
  await client.query('SELECT admit_patient($1,$2,$3)', [a, w, doctor.user_id]);
  await rejects('SELECT admit_patient($1,$2,$3)', [b, w, doctor.user_id], { code: 'MG001' });
});
await test('T12', 'A patient cannot have two active admissions', async () => {
  const w = await mkWard(3); const p = await mkPatient();
  await client.query('SELECT admit_patient($1,$2,$3)', [p, w, doctor.user_id]);
  await rejects('SELECT admit_patient($1,$2,$3)', [p, w, doctor.user_id], { text: 'uq_one_active_admission' });
});
await test('T13', 'transfer_patient moves the bed count from one ward to the other', async () => {
  const w1 = await mkWard(2); const w2 = await mkWard(2); const p = await mkPatient();
  const { id } = await one('SELECT admit_patient($1,$2,$3) AS id', [p, w1, doctor.user_id]);
  await client.query('CALL transfer_patient($1,$2)', [id, w2]);
  eq(await beds(w1), 0, 'old ward'); eq(await beds(w2), 1, 'new ward');
});
await test('T14', 'transfer_patient into a full ward fails and changes nothing', async () => {
  const w1 = await mkWard(2); const w2 = await mkWard(1);
  const a = await mkPatient('A'); const b = await mkPatient('B');
  await client.query('SELECT admit_patient($1,$2,$3)', [a, w2, doctor.user_id]);
  const { id } = await one('SELECT admit_patient($1,$2,$3) AS id', [b, w1, doctor.user_id]);
  await rejects('CALL transfer_patient($1,$2)', [id, w2], { code: 'MG001' });
  eq(await beds(w1), 1, 'old ward'); eq(await beds(w2), 1, 'new ward');
});
await test('T15', 'Prescribing reduces stock; too large a quantity fails with MG004', async () => {
  const p = await mkPatient(); const m = await mkMed(10);
  await client.query(`INSERT INTO prescriptions(patient_id,doctor_id,med_id,dosage,quantity) VALUES ($1,$2,$3,'1 daily',4)`, [p, doctor.user_id, m]);
  eq(await stock(m), 6, 'stock after prescribing');
  await rejects(`INSERT INTO prescriptions(patient_id,doctor_id,med_id,dosage,quantity) VALUES ($1,$2,$3,'1 daily',7)`, [p, doctor.user_id, m], { code: 'MG004' });
});
await test('T16', 'Deleting a prescription gives the stock back', async () => {
  const p = await mkPatient(); const m = await mkMed(10);
  const rx = await one(`INSERT INTO prescriptions(patient_id,doctor_id,med_id,dosage,quantity) VALUES ($1,$2,$3,'1 daily',4) RETURNING prescription_id`, [p, doctor.user_id, m]);
  await client.query('DELETE FROM prescriptions WHERE prescription_id=$1', [rx.prescription_id]);
  eq(await stock(m), 10, 'stock after delete');
});
await test('T17', 'Audit rows record the acting user (app.user_id) for update and delete', async () => {
  await client.query(`SELECT set_config('app.user_id', $1, true)`, [admin.user_id]);
  const p = await mkPatient();
  await client.query(`UPDATE patients SET phone_number='+91 91111 11111' WHERE patient_id=$1`, [p]);
  await client.query('DELETE FROM patients WHERE patient_id=$1', [p]);
  const rows = (await client.query(
    `SELECT action_type, user_id FROM audit_logs WHERE description LIKE '%' || $1::text || '%' ORDER BY logged_at`, [p])).rows;
  eq(rows.map((r) => r.action_type).join(','), 'PATIENT_UPDATED,PATIENT_DELETED', 'audit sequence');
  if (rows.some((r) => r.user_id !== admin.user_id)) throw new Error('audit row has the wrong user');
});
await test('T18', 'Deleting a patient cascades to notes, admissions and prescriptions', async () => {
  const w = await mkWard(2); const m = await mkMed(10); const p = await mkPatient();
  await client.query(`INSERT INTO clinical_notes(patient_id,doctor_id,chief_complaint,observation_text) VALUES ($1,$2,'a','b')`, [p, doctor.user_id]);
  await client.query('SELECT admit_patient($1,$2,$3)', [p, w, doctor.user_id]);
  await client.query(`INSERT INTO prescriptions(patient_id,doctor_id,med_id,dosage,quantity) VALUES ($1,$2,$3,'x',1)`, [p, doctor.user_id, m]);
  await client.query('DELETE FROM patients WHERE patient_id=$1', [p]);
  const left = await one(`SELECT (SELECT COUNT(*) FROM clinical_notes WHERE patient_id=$1)::int n,
                                 (SELECT COUNT(*) FROM admissions WHERE patient_id=$1)::int a,
                                 (SELECT COUNT(*) FROM prescriptions WHERE patient_id=$1)::int r`, [p]);
  eq(`${left.n}${left.a}${left.r}`, '000', 'rows left');
  eq(await beds(w), 0, 'bed released by the delete trigger');
  eq(await stock(m), 10, 'stock restored by the delete trigger');
});
await test('T19', 'Inserting a clinical note writes an audit row', async () => {
  const p = await mkPatient();
  await client.query(`INSERT INTO clinical_notes(patient_id,doctor_id,chief_complaint,observation_text) VALUES ($1,$2,'a','b')`, [p, doctor.user_id]);
  const r = await one(`SELECT COUNT(*)::int c FROM audit_logs WHERE action_type='INSERT_CLINICAL_NOTES' AND description LIKE '%Test%'`);
  if (r.c < 1) throw new Error('no audit row');
});

// ------------------------------------------------------------------ views, indexes, search, security
await test('T20', 'All views return rows and stored bed counts match reality', async () => {
  for (const v of ['v_ward_occupancy', 'v_active_admissions', 'v_doctor_workload', 'v_patient_timeline'])
    if (!(await client.query(`SELECT 1 FROM ${v} LIMIT 1`)).rowCount) throw new Error(`${v} is empty`);
  const bad = await client.query('SELECT ward_name FROM v_ward_consistency WHERE NOT consistent');
  if (bad.rowCount) throw new Error(`inconsistent: ${bad.rows.map((r) => r.ward_name).join(', ')}`);
});
await test('T21', 'B-tree, partial, GIN and HNSW indexes exist', async () => {
  const r = await client.query(`SELECT indexname FROM pg_indexes WHERE indexname IN
    ('idx_patients_name','idx_admissions_active_ward','uq_one_active_admission','idx_notes_fts','idx_notes_embedding_hnsw')`);
  eq(r.rowCount, 5, 'index count');
});
await test('T22', 'Full-text search with stemming and ranking', async () => {
  const r = await client.query(`SELECT ts_rank(search_tsv, q) r FROM clinical_notes, websearch_to_tsquery('english','wheezing') q WHERE search_tsv @@ q`);
  if (!r.rowCount) throw new Error('no match for "wheezing" (stemmed to match "wheeze")');
});
await test('T23', 'Passwords are bcrypt hashes', async () => {
  const r = await client.query(`SELECT 1 FROM users WHERE password_hash !~ '^\\$2[aby]\\$'`);
  if (r.rowCount) throw new Error('found a value that is not a bcrypt hash');
});
await test('T24', 'Every note has a 384-dimension embedding', async () => {
  const r = await one(`SELECT COUNT(*) FILTER (WHERE embedding IS NULL)::int missing,
                              COUNT(*) FILTER (WHERE vector_dims(embedding) <> 384)::int wrong FROM clinical_notes`);
  if (r.missing || r.wrong) throw new Error(`${r.missing} missing, ${r.wrong} wrong size`);
});
for (const [id, file] of [['T25', '06_queries.sql'], ['T26', '07_dml_examples.sql'], ['T27', '09_explain.sql']]) {
  await test(id, `Every statement in sql/${file} runs`, async () => {
    const n = await runFile(client, path.join(sqlDir, file));
    if (n < 3) throw new Error('suspiciously few statements');
  });
}

if (process.argv.includes('--model')) {
  const { embed, toVector } = await import('../lib/embed.mjs');
  const top = async (text) => (await one(`SELECT chief_complaint FROM clinical_notes ORDER BY embedding <=> $1::vector LIMIT 1`, [toVector(await embed(text))])).chief_complaint;
  await test('T28', 'Semantic search ranks the memory-loss note first for a paraphrase', async () => {
    const t = await top('elderly person confused, getting lost and forgetting things');
    if (!/memory|confusion/i.test(t)) throw new Error(`top result was "${t}"`);
  });
  await test('T29', 'Semantic search finds a note that keyword search misses', async () => {
    const q = 'getting lost and forgetting things';
    const kw = await client.query(`SELECT 1 FROM clinical_notes WHERE search_tsv @@ websearch_to_tsquery('english',$1)`, [q]);
    if (kw.rowCount) throw new Error('keyword search unexpectedly matched');
    const t = await top(q);
    if (!/memory|confusion/i.test(t)) throw new Error(`semantic top result: ${t}`);
  });
}

await client.end();
const w = Math.max(...results.map((r) => r[1].length));
for (const [id, name, status, msg] of results) console.log(`${id}  ${status}  ${name.padEnd(w)}${msg ? '   <- ' + msg : ''}`);
const failed = results.filter((r) => r[2] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

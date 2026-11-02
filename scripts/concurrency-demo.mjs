// Unit 4 live demo: transactions, locking, isolation levels and deadlocks with two real connections.
// Creates its own temporary rows (names start with "CC-demo") and deletes them afterwards.
import pg from 'pg';
import { loadEnv } from './env.mjs';

loadEnv();
const connect = async () => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  return c;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (s = '') => console.log(s);
const title = (s) => say(`\n=== ${s}`);

const admin = await connect();
const A = await connect();
const B = await connect();
const tag = `CC-demo-${Date.now()}`;
const one = async (c, sql, p) => (await c.query(sql, p)).rows[0];

const doctor = await one(admin, `SELECT user_id FROM users WHERE role='DOCTOR' LIMIT 1`);
if (!doctor) { say('Run npm run db:seed first.'); process.exit(1); }

const ward1 = (await one(admin, `INSERT INTO wards(ward_name,total_capacity) VALUES ($1,1) RETURNING ward_id`, [`${tag}-w1`])).ward_id;
const ward2 = (await one(admin, `INSERT INTO wards(ward_name,total_capacity) VALUES ($1,1) RETURNING ward_id`, [`${tag}-w2`])).ward_id;
const med = (await one(admin, `INSERT INTO medications(med_name,stock_quantity,unit_price) VALUES ($1,10,1) RETURNING med_id`, [`${tag}-med`])).med_id;
const mkPatient = async (n) => (await one(admin,
  `INSERT INTO patients(first_name,last_name,dob,gender,blood_group,phone_number,emergency_contact)
   VALUES ($1,$2,'1990-01-01','M','O+','+91 90000 00001','+91 90000 00002') RETURNING patient_id`, [n, tag])).patient_id;
const stock = async () => (await one(admin, 'SELECT stock_quantity s FROM medications WHERE med_id=$1', [med])).s;
const resetStock = () => admin.query('UPDATE medications SET stock_quantity=10 WHERE med_id=$1', [med]);

async function attempt(fn) {
  try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, code: e.code, message: e.message }; }
}

try {
  // ---------------------------------------------------------------- 1
  title('1. Lost update: two doctors each take 3 units from a stock of 10 (expected result: 4)');
  const readThenWrite = (c, lock) => async () => {
    await c.query('BEGIN');
    const { s } = await one(c, `SELECT stock_quantity s FROM medications WHERE med_id=$1 ${lock ? 'FOR UPDATE' : ''}`, [med]);
    await sleep(300);                                   // time between read and write, as in real application code
    await c.query('UPDATE medications SET stock_quantity=$2 WHERE med_id=$1', [med, s - 3]);
    await c.query('COMMIT');
  };
  await resetStock();
  await Promise.all([readThenWrite(A, false)(), readThenWrite(B, false)()]);
  say(`  without locking:    stock = ${await stock()}   <- one update was lost`);
  await resetStock();
  await Promise.all([readThenWrite(A, true)(), readThenWrite(B, true)()]);
  say(`  SELECT ... FOR UPDATE: stock = ${await stock()}   <- second transaction waited for the first`);

  // ---------------------------------------------------------------- 2
  title('2. The last bed: two admissions race for a ward with capacity 1 (admit_patient locks the ward row)');
  const p1 = await mkPatient('Racer1'); const p2 = await mkPatient('Racer2');
  const [r1, r2] = await Promise.all([
    attempt(() => A.query('SELECT admit_patient($1,$2,$3)', [p1, ward1, doctor.user_id])),
    attempt(() => B.query('SELECT admit_patient($1,$2,$3)', [p2, ward1, doctor.user_id])),
  ]);
  say(`  session A: ${r1.ok ? 'admitted' : `refused (${r1.code}) ${r1.message}`}`);
  say(`  session B: ${r2.ok ? 'admitted' : `refused (${r2.code}) ${r2.message}`}`);
  say(`  beds used: ${(await one(admin, 'SELECT occupied_beds b FROM wards WHERE ward_id=$1', [ward1])).b} of 1`);

  // ---------------------------------------------------------------- 3
  title('3. Deadlock: two transactions lock the same two wards in opposite order');
  const lockPair = (c, first, second) => async () => {
    await c.query('BEGIN');
    await c.query('SELECT 1 FROM wards WHERE ward_id=$1 FOR UPDATE', [first]);
    await sleep(300);
    await c.query('SELECT 1 FROM wards WHERE ward_id=$1 FOR UPDATE', [second]);
    await c.query('COMMIT');
  };
  const [d1, d2] = await Promise.all([attempt(lockPair(A, ward1, ward2)), attempt(lockPair(B, ward2, ward1))]);
  for (const [n, d, c] of [['A', d1, A], ['B', d2, B]]) {
    say(`  session ${n}: ${d.ok ? 'committed' : `aborted by PostgreSQL (${d.code}): ${d.message}`}`);
    if (!d.ok) await c.query('ROLLBACK');
  }

  title('4. Same two locks, but both sessions lock in ward_id order (what transfer_patient does)');
  const [lo, hi] = [ward1, ward2].sort();
  const [o1, o2] = await Promise.all([attempt(lockPair(A, lo, hi)), attempt(lockPair(B, lo, hi))]);
  say(`  session A: ${o1.ok ? 'committed' : o1.message}`);
  say(`  session B: ${o2.ok ? 'committed (after waiting for A)' : o2.message}`);

  // ---------------------------------------------------------------- 5
  title('5. Isolation levels: B changes the stock and commits while A is still inside a transaction');
  for (const level of ['READ COMMITTED', 'REPEATABLE READ']) {
    await resetStock();
    await A.query(`BEGIN ISOLATION LEVEL ${level}`);
    const first = (await one(A, 'SELECT stock_quantity s FROM medications WHERE med_id=$1', [med])).s;
    await B.query('UPDATE medications SET stock_quantity = stock_quantity - 1 WHERE med_id=$1', [med]);
    const second = (await one(A, 'SELECT stock_quantity s FROM medications WHERE med_id=$1', [med])).s;
    say(`  ${level.padEnd(15)} A reads ${first}, then ${second}   ${first === second ? '(repeatable: A sees its snapshot)' : '(non-repeatable read: A sees B\'s commit)'}`);
    if (level === 'REPEATABLE READ') {
      const w = await attempt(() => A.query('UPDATE medications SET stock_quantity = stock_quantity - 1 WHERE med_id=$1', [med]));
      say(`  ${' '.repeat(15)} A then updates the row B changed: ${w.ok ? 'ok' : `${w.code} ${w.message}  -> roll back and retry`}`);
    }
    await A.query('ROLLBACK');
  }
  say('\nDone. Temporary rows are being removed.');
} finally {
  for (const c of [A, B]) await c.query('ROLLBACK').catch(() => {});
  await admin.query(`DELETE FROM patients WHERE last_name=$1`, [tag]);
  await admin.query(`DELETE FROM audit_logs WHERE description LIKE '%' || $1::text || '%'`, [tag]);
  await admin.query(`DELETE FROM wards WHERE ward_name LIKE $1`, [`${tag}%`]);
  await admin.query(`DELETE FROM medications WHERE med_name LIKE $1`, [`${tag}%`]);
  await Promise.all([admin.end(), A.end(), B.end()]);
}

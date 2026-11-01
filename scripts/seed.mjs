// Demo data: users (bcrypt), wards, medications, patients, admissions (current and past),
// clinical notes with real embeddings, and prescriptions. Dates are spread over the last month.
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { loadEnv } from './env.mjs';
import { embed, toVector } from '../lib/embed.mjs';

loadEnv();
const PASSWORD = process.env.SEED_PASSWORD || 'ChangeMe123!';
const daysAgo = (d) => new Date(Date.now() - d * 86400000);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query('TRUNCATE audit_logs, prescriptions, clinical_notes, admissions, medications, wards, patients, users CASCADE');

const insert = async (sql, params) => (await client.query(sql, params)).rows[0];

// ---- users
const hash = await bcrypt.hash(PASSWORD, 10);
const userDefs = [
  ['Dr. Ananya Rao', 'ananya.rao@medgraph.test', 'DOCTOR'],
  ['Dr. Rohan Mehta', 'rohan.mehta@medgraph.test', 'DOCTOR'],
  ['Dr. Priya Nair', 'priya.nair@medgraph.test', 'DOCTOR'],
  ['Kiran Admin', 'admin@medgraph.test', 'ADMIN'],
];
const users = [];
for (const [name, email, role] of userDefs) {
  users.push((await insert('INSERT INTO users(full_name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING user_id', [name, email, hash, role])).user_id);
}
const doc = users.slice(0, 3);

// ---- wards and medications
const wardDefs = [['General Ward', 6], ['ICU', 3], ['Neurology Ward', 4]];
const wards = [];
for (const [name, cap] of wardDefs) wards.push((await insert('INSERT INTO wards(ward_name,total_capacity) VALUES ($1,$2) RETURNING ward_id', [name, cap])).ward_id);

const medDefs = [
  ['Paracetamol 500mg', 500, 1.5], ['Amoxicillin 250mg', 300, 4.25], ['Metformin 500mg', 400, 2.1],
  ['Atorvastatin 20mg', 250, 6.8], ['Salbutamol Inhaler', 80, 95.0], ['Levetiracetam 500mg', 120, 12.4],
  ['Omeprazole 20mg', 350, 3.2], ['Aspirin 75mg', 450, 0.9], ['Insulin Glargine Pen', 45, 640.0],
];
const meds = [];
for (const [name, stock, price] of medDefs) meds.push((await insert('INSERT INTO medications(med_name,stock_quantity,unit_price) VALUES ($1,$2,$3) RETURNING med_id', [name, stock, price])).med_id);

// ---- patients
const patientDefs = [
  ['Arjun', 'Sharma', '1958-03-14', 'M', 'B+'], ['Meera', 'Iyer', '1971-07-02', 'F', 'O+'],
  ['Vikram', 'Singh', '1989-11-23', 'M', 'A+'], ['Sneha', 'Patel', '1995-05-30', 'F', 'AB+'],
  ['Rahul', 'Verma', '1947-01-09', 'M', 'O-'], ['Divya', 'Menon', '2001-09-18', 'F', 'B-'],
  ['Karthik', 'Reddy', '1966-12-05', 'M', 'A-'], ['Lakshmi', 'Gowda', '1953-04-21', 'F', 'O+'],
  ['Imran', 'Khan', '1984-08-11', 'M', 'B+'], ['Nisha', 'Joshi', '1992-02-27', 'F', 'A+'],
  ['Suresh', 'Kumar', '1975-06-16', 'M', 'AB-'], ['Pooja', 'Bhat', '1999-10-03', 'F', 'O+'],
];
const pat = [];
for (const [i, [fn, ln, dob, g, bg]] of patientDefs.entries()) {
  pat.push((await insert(
    `INSERT INTO patients(first_name,last_name,dob,gender,blood_group,phone_number,emergency_contact)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING patient_id`,
    [fn, ln, dob, g, bg, `+91 98450 1${String(i + 1).padStart(4, '0')}`, `+91 98860 2${String(i + 1).padStart(4, '0')}`])).patient_id);
}

// ---- admissions: current ones go through admit_patient() so the trigger counts beds
// [patient, ward, doctor, days ago]
for (const [p, w, d, ago] of [[0, 1, 0, 3], [1, 0, 1, 6], [2, 0, 2, 2], [4, 1, 0, 9], [6, 2, 2, 12], [7, 2, 1, 5]]) {
  const { id } = await insert('SELECT admit_patient($1,$2,$3) AS id', [pat[p], wards[w], doc[d]]);
  await client.query('UPDATE admissions SET admission_date = $2 WHERE admission_id = $1', [id, daysAgo(ago)]);
}
// past stays (already discharged)
for (const [p, w, d, from, to] of [[3, 0, 0, 20, 17], [5, 2, 0, 25, 21], [8, 0, 1, 15, 13], [9, 1, 2, 28, 26]]) {
  await client.query(
    `INSERT INTO admissions(patient_id,ward_id,doctor_id,admission_date,discharge_date,status) VALUES ($1,$2,$3,$4,$5,'DISCHARGED')`,
    [pat[p], wards[w], doc[d], daysAgo(from), daysAgo(to)]);
}

// ---- clinical notes with embeddings: [patient, doctor, days ago, complaint, observations]
const notes = [
  [0, 0, 3, 'Crushing chest pain radiating to left arm', 'Diaphoretic, pulse irregular, ST elevation on ECG. Pain began 40 minutes ago during exertion. History of hypertension.'],
  [4, 0, 9, 'Shortness of breath and chest tightness', 'Wheeze on auscultation, oxygen saturation 89 percent. Worsens at night. Long term smoker.'],
  [1, 1, 6, 'Persistent cough and fever for 5 days', 'Productive green sputum, crackles in right lower lobe, temperature 38.9 C. Chest X-ray shows consolidation.'],
  [2, 1, 2, 'Fever, chills and body aches', 'Sudden onset high fever with severe myalgia and fatigue. Family members similarly unwell. No rash.'],
  [6, 2, 12, 'Progressive memory loss and confusion', 'Family reports getting lost in familiar places, repeating questions, and personality change over 8 months. Appears withdrawn.'],
  [7, 2, 5, 'Sudden behavioural change and agitation', 'Became paranoid and aggressive over two weeks, sleeping very little, no prior psychiatric history. Disoriented to time.'],
  [6, 2, 10, 'Gradual physical deterioration and weight loss', 'Unintentional weight loss of 9 kg in 3 months, muscle wasting, fatigue, poor appetite, tremor in right hand.'],
  [3, 0, 20, 'Severe headache with visual aura', 'Throbbing unilateral headache, nausea, photophobia, flashing lights before onset. Similar episodes monthly.'],
  [5, 2, 25, 'Seizure lasting two minutes', 'Generalised tonic clonic seizure witnessed by family, post-ictal confusion for 20 minutes. First episode.'],
  [8, 1, 15, 'Excessive thirst and frequent urination', 'Polyuria, polydipsia, blurred vision, random blood glucose 342 mg/dL. Recent unexplained weight loss.'],
  [9, 0, 28, 'Burning upper abdominal pain after meals', 'Epigastric pain relieved by antacids, bloating, no vomiting of blood. Pain worse when fasting.'],
  [10, 1, 8, 'Lower back pain radiating down the leg', 'Sharp pain to left calf, positive straight leg raise, numbness in foot. Began after lifting heavy load.'],
  [11, 2, 7, 'Fatigue, low mood and loss of interest', 'Low mood for 6 weeks, poor sleep, reduced appetite, withdrawn from friends, no suicidal ideation reported.'],
  [0, 0, 1, 'Follow-up: chest pain resolved after stenting', 'Stable vitals, no recurrent pain, ECG normalised. Started on aspirin and atorvastatin.'],
  [4, 1, 4, 'Increased wheeze after respiratory infection', 'Bilateral wheeze, using accessory muscles, responded to nebulised salbutamol. Peak flow reduced.'],
  [1, 1, 2, 'Pneumonia improving on antibiotics', 'Fever settled, cough reducing, saturation 96 percent on room air, appetite returning.'],
  [7, 2, 3, 'Hand tremor and slowness of movement', 'Resting tremor, rigidity in both arms, shuffling gait, reduced facial expression. Symptoms progressing over a year.'],
  [8, 1, 13, 'Foot ulcer with delayed healing', 'Non-healing ulcer on plantar surface, reduced sensation in toes, poorly controlled blood sugars.'],
];
for (const [p, d, ago, cc, obs] of notes) {
  process.stdout.write('.');
  const vec = await embed(`${cc}. ${obs}`);
  await client.query(
    `INSERT INTO clinical_notes(patient_id,doctor_id,chief_complaint,observation_text,embedding,created_at)
     VALUES ($1,$2,$3,$4,$5::vector,$6)`, [pat[p], doc[d], cc, obs, toVector(vec), daysAgo(ago)]);
}
console.log(`\n${notes.length} notes embedded.`);

// ---- prescriptions (the trigger reduces stock): [patient, doctor, medication, dosage, quantity, days ago]
for (const [p, d, m, dose, qty, ago] of [
  [0, 0, 7, '75mg once daily', 30, 1], [0, 0, 3, '20mg at night', 30, 1], [4, 1, 4, '2 puffs as needed', 1, 4],
  [1, 1, 1, '250mg three times daily', 21, 6], [8, 1, 2, '500mg twice daily', 60, 14], [8, 1, 8, '10 units at night', 3, 14],
  [5, 2, 5, '500mg twice daily', 60, 24], [9, 0, 6, '20mg before breakfast', 28, 27], [2, 1, 0, '500mg every 6 hours', 12, 2],
]) {
  await client.query(
    'INSERT INTO prescriptions(patient_id,doctor_id,med_id,dosage,quantity,prescribed_date) VALUES ($1,$2,$3,$4,$5,$6)',
    [pat[p], doc[d], meds[m], dose, qty, daysAgo(ago)]);
}
await client.end();
console.log('Seed complete. Sign in with (password = SEED_PASSWORD):');
for (const [, email, role] of userDefs) console.log(`  ${role.padEnd(6)} ${email}`);

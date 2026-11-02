# Design theory: how MedGraph applies the course material

Covers Unit 1 (ER to relational, relational algebra), Unit 3 (functional dependencies, normal forms,
query optimisation) and Unit 4 (transactions, concurrency, NoSQL and vector databases).
The runnable counterparts are in `sql/06_queries.sql`, `sql/08_transaction_demo.sql`, `sql/09_explain.sql`,
`scripts/concurrency-demo.mjs` and `scripts/explain-demo.mjs`.

---

## 1. From the ER model to the relational schema

**Entity sets:** USER, PATIENT, WARD, MEDICATION, CLINICAL_NOTE, AUDIT_LOG.
**Relationships and how each was reduced:**

| ER construct | Cardinality | Reduction rule | Result |
|---|---|---|---|
| Strong entity set with simple attributes | | One table, key attribute becomes the primary key | `users`, `patients`, `wards`, `medications` |
| PATIENT - WARD - USER (doctor) "is admitted" | ternary, each side 1:N | A relationship set with its own attributes (dates, status) becomes a table whose key includes the participants; a surrogate `admission_id` is used because the same patient can be admitted to the same ward more than once | `admissions(patient_id, ward_id, doctor_id, ...)` |
| PATIENT - MEDICATION "is prescribed" | M:N with attributes `dosage`, `quantity`, `date` | M:N relationship becomes an associative table with FKs to both sides plus its own attributes | `prescriptions` |
| PATIENT - CLINICAL_NOTE "has" | 1:N | FK on the "many" side | `clinical_notes.patient_id` |
| USER - CLINICAL_NOTE "writes" | 1:N | FK on the "many" side | `clinical_notes.doctor_id` |
| USER - AUDIT_LOG "triggers" | 1:N, partial participation | FK on the "many" side, nullable (failed logins have no user) | `audit_logs.user_id` |

**Attribute kinds.** *Composite:* patient name is stored as `first_name` and `last_name` (atomic, 1NF).
*Derived:* `age` is **not** stored; it is computed from `dob` by `patient_age()`. A stored age would be wrong
by tomorrow. `wards.occupied_beds` is derived (the count of ADMITTED rows) and **is** stored, deliberately,
for a cheap capacity check; a trigger maintains it and the view `v_ward_consistency` verifies it.
*Multivalued:* none (a patient with several phone numbers would need their own table).
*Weak entity sets:* none.

**Participation and delete rules.** An admission cannot exist without a patient (total participation), so
`ON DELETE CASCADE`. A doctor or ward may disappear while history must remain, so `ON DELETE SET NULL`.
A medication that has been prescribed cannot be deleted, so `ON DELETE RESTRICT`.

---

## 2. Relational algebra for the main queries

Notation: σ selection, π projection, ⋈ natural/theta join, × product, ρ rename, γ grouping/aggregation,
∪ union, ∩ intersection, − difference, ÷ division. Each is run in `sql/06_queries.sql`.

| Need | Algebra | SQL idea |
|---|---|---|
| Patients with blood group O+ | σ blood_group='O+' (PATIENTS) | `WHERE` |
| Distinct blood groups | π blood_group (PATIENTS) | `SELECT DISTINCT` |
| Names of admitted patients with ward | π first_name, last_name, ward_name (σ status='ADMITTED' (PATIENTS ⋈ ADMISSIONS ⋈ WARDS)) | joins + `WHERE` |
| Pairs of patients with the same blood group | π (σ p1.blood_group = p2.blood_group ∧ p1.id < p2.id (ρ p1 (PATIENTS) × ρ p2 (PATIENTS))) | self-join |
| Admitted patients per ward | γ ward_id; COUNT(*) → admitted (σ status='ADMITTED' (ADMISSIONS)) | `GROUP BY` |
| Patients with notes and prescriptions | π patient_id (CLINICAL_NOTES) ∩ π patient_id (PRESCRIPTIONS) | `INTERSECT` |
| Patients with notes but no prescription | π patient_id (CLINICAL_NOTES) − π patient_id (PRESCRIPTIONS) | `EXCEPT` |
| Doctors who admitted to **every** ward | π doctor_id, ward_id (ADMISSIONS) ÷ π ward_id (WARDS) | double `NOT EXISTS` (no division operator in SQL) |

Outer joins (`LEFT`, `RIGHT`, `FULL`) extend ⋈ by keeping unmatched tuples padded with NULL; `LEFT JOIN ... WHERE x IS NULL`
is the anti-join used to find patients who were never admitted.

---

## 3. Functional dependencies and normal forms

### 3.1 Dependencies in the real schema
| Relation | Functional dependencies | Candidate keys | Highest normal form |
|---|---|---|---|
| users | user_id → all; email → user_id | {user_id}, {email} | BCNF |
| patients | patient_id → all | {patient_id} | BCNF (name, phone and dob together do not identify a person, so no other FD is assumed) |
| wards | ward_id → all; ward_name → ward_id | {ward_id}, {ward_name} | BCNF |
| medications | med_id → all; med_name → med_id | {med_id}, {med_name} | BCNF |
| admissions | admission_id → all | {admission_id} | BCNF |
| clinical_notes | note_id → all | {note_id} | BCNF for the base columns (see note) |
| prescriptions | prescription_id → all | {prescription_id} | BCNF |
| audit_logs | log_id → all | {log_id} | BCNF |

Checks that make this honest: there is **no** FD `patient_id → ward_id` (a patient can move between wards over time),
and **no** FD `doctor_id → ward_id` (the seed data has a doctor admitting to three wards). Had either held, `admissions` would need decomposing.

**Notes.** (1) `clinical_notes.embedding` and `search_tsv` are functionally determined by
(`chief_complaint`, `observation_text`), which is not a key. Strictly this is a BCNF violation, but these two
columns are derived index data stored for speed (like an index), not facts about the world, and the database
generates `search_tsv` itself. (2) `wards.occupied_beds` is the deliberate redundancy described above.

### 3.2 Armstrong's axioms on a flat relation
Suppose the hospital kept one wide table:

`ADMISSION_FLAT(admission_id, patient_id, patient_name, dob, ward_id, ward_name, total_capacity, doctor_id, doctor_name, admission_date, status)`

with F = { admission_id → patient_id, ward_id, doctor_id, admission_date, status;
patient_id → patient_name, dob; ward_id → ward_name, total_capacity; doctor_id → doctor_name }.

Closure of {admission_id}: start with {admission_id}. The first FD adds patient_id, ward_id, doctor_id, admission_date, status.
Transitivity through patient_id adds patient_name, dob; through ward_id adds ward_name, total_capacity; through doctor_id adds doctor_name.
The closure is the whole relation, and no proper subset of a single attribute exists, so **admission_id is a candidate key**.
(Rules used: reflexivity, augmentation, transitivity; decomposition and union follow from them.)
F is already a minimal cover: every right side is a single attribute after decomposition, no left side has an extraneous attribute, and no FD can be derived from the others.

**Why this table is bad (3NF violation).** The key is a single attribute, so 2NF holds trivially, but `admission_id → patient_id → patient_name` is a transitive dependency:
* *Update anomaly:* renaming a ward means editing every admission row; miss one and the data contradicts itself.
* *Insertion anomaly:* a new ward or a new patient cannot be recorded until an admission exists.
* *Deletion anomaly:* deleting a patient's only admission also deletes the patient's details.

**3NF synthesis** makes one relation per determinant: (admission_id, patient_id, ward_id, doctor_id, admission_date, status),
(patient_id, patient_name, dob), (ward_id, ward_name, total_capacity), (doctor_id, doctor_name). This is lossless and
dependency-preserving and is exactly `admissions`, `patients`, `wards`, `users` in MedGraph.

### 3.3 2NF: a partial dependency
`RX_FLAT(patient_id, med_id, prescribed_date, dosage, quantity, med_name, unit_price, patient_name)` with key
{patient_id, med_id, prescribed_date}. Here `med_id → med_name, unit_price` and `patient_id → patient_name` depend on **part** of the key,
so 2NF is violated (and a price change touches every prescription of that drug). Decomposing gives `medications`, `patients`, `prescriptions`.
MedGraph uses a surrogate `prescription_id` because the same drug can legitimately be prescribed to the same patient twice in one day.

### 3.4 BCNF versus 3NF
`ASSIGNMENT(patient_id, ward_id, doctor_id)` with {patient_id, ward_id} → doctor_id and doctor_id → ward_id (each doctor is posted to one ward).
Keys: {patient_id, ward_id} and {patient_id, doctor_id}. The FD doctor_id → ward_id has a non-superkey determinant, so the relation is **not in BCNF**,
but ward_id is a prime attribute, so it **is in 3NF**. BCNF decomposition gives (doctor_id, ward_id) and (patient_id, doctor_id), which loses the dependency
{patient_id, ward_id} → doctor_id (the classic trade-off). MedGraph avoids the problem because doctors are not tied to one ward.

### 3.5 4NF and 5NF
* **4NF.** If patients stored independent lists in one table, e.g. `PATIENT_INFO(patient_id, allergy, condition)`, then patient_id ↠ allergy | condition
  is a non-trivial multivalued dependency and every allergy would have to be repeated with every condition. The fix is two tables. MedGraph stores neither list today; adding them later must use separate tables.
* **5NF.** `admissions` is a ternary relationship (patient, ward, doctor). It could be split into three binary relations losslessly only if the rule
  "patient was in W, doctor D works in W, D treated the patient, therefore the patient was admitted to W by D" were always true. It is not, and an admission is an event with its own identity and dates,
  so there is no non-trivial join dependency beyond the key: the relation is in 5NF.

---

## 4. Query processing and optimisation

PostgreSQL parses the query, rewrites views into their definitions, and the **cost-based planner** enumerates plans using table statistics (gathered by `ANALYZE`)
and picks the cheapest; the executor then runs it. Things the planner chooses between, all visible with `EXPLAIN`:

| Decision | Options | Where to see it |
|---|---|---|
| Access path | Seq Scan, Index Scan, Bitmap Heap Scan, Index Only Scan | `sql/09_explain.sql` |
| Join algorithm | Nested Loop (few rows, indexed inner side), Hash Join (equality joins, one side fits memory), Merge Join (both inputs sorted) | the 4-table join in `09_explain.sql` |
| Join order | any order that is cheaper, because joins are associative and commutative | same query |

Classic heuristics the planner applies automatically: push selections below joins, project early, use indexes when a predicate is selective.
With the few seeded rows PostgreSQL usually prefers sequential scans (cheaper for tiny tables), so `npm run demo:explain`
generates 50,000 patients and 5,000 vectors inside a transaction, prints the plan with and without the index, then rolls back.

| Index | Type | Serves |
|---|---|---|
| `idx_patients_name` on `lower(last_name), lower(first_name)` | B-tree, expression | `WHERE lower(last_name) = ...` (an index on `last_name` alone would not be used) |
| `idx_admissions_active_ward`, `uq_one_active_admission` | partial B-tree | queries and a constraint that only concern `status = 'ADMITTED'`; far smaller than a full index |
| foreign-key indexes | B-tree | joins and cascading deletes (PostgreSQL does not create these automatically) |
| `idx_notes_fts` | GIN on `tsvector` | `search_tsv @@ query` |
| `idx_notes_embedding_hnsw` | HNSW, `vector_cosine_ops` | `ORDER BY embedding <=> x LIMIT k` |

**Exact versus approximate search.** Without the vector index PostgreSQL computes the distance to every row and sorts (exact, O(n)).
HNSW walks a layered proximity graph and returns very likely, but not guaranteed, nearest neighbours in far less time (approximate).
When a selective relational filter is combined with an approximate index, the index may return fewer than *k* rows that pass the filter; at this project's size
the planner normally scans exactly, but this is the limit to mention if asked.

---

## 5. Transactions and concurrency control

| ACID property | Where MedGraph relies on it |
|---|---|
| Atomicity | `withTransaction()` and every procedure: a failed prescription leaves no half-written state |
| Consistency | CHECK, FK, UNIQUE constraints and triggers move the database only between valid states |
| Isolation | MVCC snapshots plus row locks (`FOR UPDATE`) |
| Durability | PostgreSQL's write-ahead log: a committed prescription survives a crash |

**MVCC.** Readers never block writers: each statement (READ COMMITTED) or transaction (REPEATABLE READ) sees a snapshot.

| Isolation level (PostgreSQL) | Dirty read | Non-repeatable read | Phantom | Note |
|---|---|---|---|---|
| READ UNCOMMITTED | no | yes | yes | behaves as READ COMMITTED in PostgreSQL |
| READ COMMITTED (default) | no | yes | yes | what the app uses |
| REPEATABLE READ | no | no | no (snapshot isolation) | updating a row changed after the snapshot fails with `40001`; retry |
| SERIALIZABLE | no | no | no | detects dangerous read/write patterns, may fail with `40001` |

**Problems demonstrated** by `npm run demo:concurrency` (manual version in `sql/08_transaction_demo.sql`):
1. *Lost update:* two doctors read stock 10 and each write 7, final stock 7 instead of 4. Fixed by `SELECT ... FOR UPDATE`.
2. *Last bed:* two concurrent `admit_patient()` calls; the ward row lock makes one succeed and one fail with "That ward is full".
3. *Deadlock:* two transactions lock the same two wards in opposite order; PostgreSQL detects the cycle (after `deadlock_timeout`, 1 s by default) and aborts one with `40P01`.
4. *Deadlock prevention:* `transfer_patient()` always locks wards in `ward_id` order, so the cycle cannot form.
5. *Isolation:* READ COMMITTED shows a non-repeatable read; REPEATABLE READ keeps the snapshot and raises `40001` on a conflicting update.

Locking used in the code: row-level exclusive locks (`FOR UPDATE`) in `admit_patient`, `transfer_patient`, `fn_decrement_stock` and the prescribing route.
Two-phase locking is the textbook model: locks are acquired while the transaction runs and all released at commit or rollback.

---

## 6. NoSQL, key-value, graph and vector databases

| Model | What it is good at | In MedGraph |
|---|---|---|
| Relational (PostgreSQL) | structured, related, constrained data; joins; transactions | patients, wards, admissions, prescriptions, users, audit |
| Vector (pgvector) | nearest-neighbour search over embeddings | clinical notes |
| Key-value (Redis) | very fast lookup by key, expiry | **not used.** Sessions are stateless JWT cookies, so there is nothing to look up. It would fit login rate limiting or caching search results. |
| Document (MongoDB) | nested, schema-flexible documents | **not used.** Clinical data here is fixed-shape and relational; documents would lose FK and CHECK enforcement. |
| Graph (Neo4j) | multi-hop relationships | **not used.** Every query here is a one- or two-hop join. A graph would pay off for questions such as "which patients are linked to this patient through shared doctors, wards and similar notes", and is listed as future work. |

**Vector search with relational data** (the Unit 4 topic) is implemented directly: the similar-case search combines cosine similarity with ordinary SQL
filters on age, gender, admission status and date, and the hybrid mode merges vector ranking with full-text ranking using Reciprocal Rank Fusion in a single query (`lib/search.js`).
Keeping both in PostgreSQL means one transaction, real foreign keys between notes and patients, and no synchronisation job between two stores.

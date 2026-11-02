# Evaluation demo (about 10 minutes)

Before: `docker compose up -d`, `npm run db:reset`, `npm run dev`. Use two browser windows: one signed in as a doctor, one as the admin.

1. **Problem (1 min).** Keyword search misses similar cases. Show "older patient becoming confused and withdrawn" later.
2. **Design (2 min).** ER diagram and schema, then why one PostgreSQL database with pgvector (DOCUMENTATION section 7). Mention the normal-form analysis (DESIGN_THEORY section 3).
3. **Database (2 min).** Show `03_functions_triggers.sql` (trigger, function, procedure) and run `npm run test:db`. Then `npm run demo:concurrency` for the lost update and the deadlock.
4. **Doctor (3 min).**
   - Dashboard: ward bars, admissions per day (recursive CTE), doctor ranking (window function).
   - Admissions: fill the ICU until "That ward is full"; transfer a patient to another ward; discharge one and watch the bed free up.
   - Similar cases: the first example chip in **Meaning** mode, then **Keywords** mode (finds nothing), then **Both**. Apply an age filter. Open a result and use "More like this".
   - Prescriptions: ask for more than the stock (refused), then a valid one; cancel it and see stock return.
5. **Admin (1 min).** Add a medication (upsert); open the audit log and filter by `PATIENT_DELETED` after deleting a test patient; show a doctor cannot open `/audit`.
6. **Close (1 min).** Syllabus map, test output, both Git histories.

Questions to expect:
* *Why pgvector, not Qdrant?* One database, joins with patient data, one transaction, no synchronisation job.
* *Which metric?* Cosine; vectors are normalised.
* *Two doctors take the last bed?* `admit_patient()` locks the ward row; one wins, one gets "That ward is full".
* *Why does `transfer_patient` lock wards in order?* Opposite transfers would otherwise deadlock (shown in the demo).
* *Why store `occupied_beds`?* Cheap capacity check; a trigger keeps it right and `v_ward_consistency` verifies it.
* *Is the schema in BCNF?* Yes, with the FD list in DESIGN_THEORY 3.1; the derived `embedding` and `search_tsv` columns are noted as the one deliberate exception.
* *Why no NoSQL or Neo4j?* DESIGN_THEORY section 6.

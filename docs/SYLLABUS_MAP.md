# Syllabus coverage

Every topic in the course syllabus, where it appears in MedGraph, and where it is **not** covered and why.
"Run" means the statement is executed by `npm run test:db` (tests T25 to T27), so it is known to be valid SQL.

## Unit 1: Introduction to Database Management and SQL

| Topic | Where | Notes |
|---|---|---|
| Purpose of a DBMS, view of data | `docs/DOCUMENTATION.md` section 4 | Three levels: physical (tables, indexes), logical (schema), external (views `v_*` and the role-based pages) |
| Database application architecture | `docs/DOCUMENTATION.md` section 11 | Three tiers: browser, Next.js route handlers, PostgreSQL |
| E-R model | `docs/DOCUMENTATION.md` section 5 | Entities, keys, cardinalities, derived attribute (age) |
| Reducing ER to a relational schema | `docs/DESIGN_THEORY.md` section 1 | Rule-by-rule table, including the ternary and M:N cases |
| Relational algebra: unary, binary, aggregate, grouping | `docs/DESIGN_THEORY.md` section 2; queries 1.1 to 1.6 in `sql/06_queries.sql` | σ, π, ρ, ⋈, ×, ∪, ∩, −, ÷, γ |
| SQL overview, data definition, structure of queries | `sql/01` to `sql/06` | |
| Constraints and keys | `sql/01_schema.sql`, `sql/02_indexes.sql` | PK, FK with delete rules, UNIQUE, CHECK (named), NOT NULL, partial unique index |

## Unit 2: Advanced SQL in Database Design

| Topic | Where |
|---|---|
| Database modification | `sql/07_dml_examples.sql` (multi-row INSERT, INSERT ... SELECT, upsert `ON CONFLICT`, UPDATE ... FROM, DELETE ... USING, data-modifying CTE, `RETURNING`, cascade); the app uses INSERT, UPDATE and DELETE on patients, notes, prescriptions and medications |
| Basic operations, aggregate functions | `sql/06_queries.sql` (COUNT, SUM, AVG, MIN, MAX, STRING_AGG, FILTER, GROUP BY, HAVING, ROLLUP) |
| Set operations | `UNION`, `UNION ALL`, `INTERSECT`, `EXCEPT` in `sql/06_queries.sql`; `UNION ALL` also builds the view `v_patient_timeline` |
| Null values | `sql/06_queries.sql`: `IS NULL`, `= NULL` pitfall, `COALESCE`, `NULLIF`, NULLs in aggregates and outer joins |
| Nested subqueries, correlated queries | `sql/06_queries.sql`: scalar, `IN`, `NOT EXISTS`, `ALL`, derived table, correlated in WHERE and in SELECT |
| Join expressions | INNER, LEFT, RIGHT, FULL OUTER, CROSS, NATURAL, self-join, `USING` in `sql/06_queries.sql` |
| Views | `sql/04_views.sql`: `v_ward_occupancy`, `v_ward_consistency`, `v_active_admissions`, `v_doctor_workload`, `v_patient_timeline` |
| Triggers | `sql/03_functions_triggers.sql`: doctor-role check, bed counts, stock decrement and restore, audit trail (BEFORE and AFTER, row level, INSERT, UPDATE, DELETE) |
| Functions | `admit_patient()`, `patient_age()`, `current_app_user()`, trigger functions |
| Procedures | `discharge_patient()` and `transfer_patient()` (`CREATE PROCEDURE`, called with `CALL`) |
| CTE | `WITH` in `sql/06_queries.sql`; **recursive** CTE builds the 7-day series used on the dashboard |
| Window functions | `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `LAG`, `NTILE`, running `COUNT`, aggregate-over-window, named `WINDOW`; `RANK()` drives the doctor workload table |
| Full-text search functions | `to_tsvector`, `to_tsquery`, `plainto_tsquery`, `phraseto_tsquery`, `websearch_to_tsquery`, `ts_rank`, `ts_headline`, `setweight`, generated `tsvector` column, GIN index |

## Unit 3: Design Concepts and Implementation

| Topic | Where |
|---|---|
| Query processing and optimisation | `docs/DESIGN_THEORY.md` section 4; `sql/09_explain.sql`; `npm run demo:explain` (plans with and without indexes on 50,000 rows) |
| Functional dependencies, inference rules | `docs/DESIGN_THEORY.md` sections 3.1 and 3.2 (Armstrong's axioms, closure, minimal cover) |
| 1NF, 2NF, 3NF and general definitions | sections 3.1 to 3.3, with anomalies and a worked decomposition |
| BCNF | section 3.4 (a relation that is 3NF but not BCNF, and the trade-off) |
| Higher normal forms | section 3.5 (4NF multivalued dependency, 5NF join dependency) |

## Unit 4: Next-Gen Data Management

| Topic | Where |
|---|---|
| Transactions | `withTransaction()` in `lib/db.js`; prescribing route; procedures; `sql/08_transaction_demo.sql` (COMMIT, ROLLBACK, SAVEPOINT) |
| Concurrency control, locking | `FOR UPDATE` in `admit_patient`, `transfer_patient`, `fn_decrement_stock`; `npm run demo:concurrency` shows a lost update, the last-bed race, a deadlock, deadlock prevention by lock ordering, and isolation levels |
| Introduction to NoSQL, key-value, graph (Neo4j) | `docs/DESIGN_THEORY.md` section 6: **discussed, not implemented.** The project requirements ask for SQL plus a vector database, and each of these models would have been added for show; the section says where each would genuinely fit |
| Vector databases | pgvector: `vector(384)` column, HNSW index, cosine distance; embedding with `all-MiniLM-L6-v2` |
| Vector search with relational (and NoSQL) databases | Similar-case search: vector similarity plus relational filters, hybrid vector and full-text ranking (RRF), "more like this" from a stored vector; queries in `sql/06_queries.sql` and `lib/search.js` |
| Web application development with Next.js and SQL | `app/` (App Router pages) and `app/api/` (route handlers using parameterised SQL through `pg`) |

## Project requirements checklist (from the assignment sheet)

| Requirement | Status |
|---|---|
| SQL (PostgreSQL) + vector database | Done: PostgreSQL with pgvector |
| ER diagram, relational schema, entities, attributes, keys, constraints | `docs/DOCUMENTATION.md` sections 5 to 9; Chen diagram in `docs/er-diagram.svg` |
| DDL: CREATE, ALTER, DROP, indexes, views | `sql/01` to `sql/05` |
| DML: INSERT, UPDATE, DELETE, SELECT, joins, GROUP BY, HAVING, ORDER BY, subqueries | `sql/06`, `sql/07`, and the app routes |
| At least 4 advanced concepts | 8 used: transactions, views, functions, procedures, triggers, indexing, full-text search, vector similarity |
| Embeddings explained (what, model, storage, metric, retrieval) | `docs/DOCUMENTATION.md` section 8 |
| Next.js interface with forms, tables, search, filters, dashboard | `app/` |
| Backend/API layer; no hard-coded credentials; environment variables | `app/api/`, `.env.local` |
| Authentication, at least 2 roles | bcrypt + JWT cookie; DOCTOR and ADMIN, enforced in middleware and in every route |
| Validation and integrity at the database level | named CHECK constraints, FKs, UNIQUE, triggers; tests T01 to T09 |
| Security basics | bcrypt hashes, httpOnly cookie, parameterised SQL, secrets in environment variables |
| Documentation, Git history with individual commits, README | `docs/`, `README.md`; commit history is yours to make |
| Goes beyond CRUD | similar-case search, transfer procedure, concurrency-safe prescribing, patient timeline, audit by trigger |

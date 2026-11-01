# MedGraph: semantic clinical records

DBMS Experiential Learning, Level 3 project. Team: Vishal (PES1UG24AM241) and Samarth A (PES1UG24AM243).

Structured hospital data lives in PostgreSQL. Clinical notes are also stored as vector embeddings (pgvector), so a doctor can describe a
case in plain words and find past cases with a similar meaning, even when no keywords match. Similarity search can be combined with
ordinary filters (age, gender, currently admitted) and with full-text ranking.

**Stack:** Next.js 14 (pages and route handlers), PostgreSQL 16 + pgvector, `all-MiniLM-L6-v2` embeddings (384 dimensions, computed locally), bcrypt + JWT cookie, roles DOCTOR and ADMIN.

## Run it

Needs Node.js 18+ and Docker (or PostgreSQL 16 with the pgvector extension).

```bash
npm install
cp .env.example .env.local        # set JWT_SECRET and SEED_PASSWORD
docker compose up -d              # PostgreSQL with pgvector on port 5432

npm run db:setup                  # sql/01 to 05: tables, indexes, triggers, procedures, views
npm run db:seed                   # demo data; the first run downloads the ~25 MB embedding model
npm run test:db                   # 27 database tests, all rolled back (add "-- --model" for 2 more)
npm run dev                       # http://localhost:3000
```

**Without Docker (Windows + WSL Ubuntu 24.04):** install PostgreSQL inside WSL; WSL forwards `localhost:5432` to Windows, so the
same `.env.local` works.

```bash
wsl -u root -- apt-get install -y postgresql-16 postgresql-16-pgvector
wsl -u root -- pg_ctlcluster 16 main start
wsl -u root -- su postgres -c "psql -c \"CREATE ROLE medgraph LOGIN PASSWORD 'medgraph_pw' SUPERUSER\" -c 'CREATE DATABASE medgraph OWNER medgraph'"
```

After a restart only the `pg_ctlcluster ... start` line is needed. The WSL window must stay open, otherwise WSL shuts down when idle.

`npm run db:reset` rebuilds everything. Demo scripts (they clean up after themselves):

```bash
npm run demo:concurrency          # lost update, last-bed race, deadlock, isolation levels
npm run demo:explain              # query plans with and without indexes on 50,000 rows
```

### Logins

Password for all accounts is the `SEED_PASSWORD` in `.env.local`.

| Role | Email | Can use |
|---|---|---|
| Doctor | `ananya.rao@medgraph.test` (also `rohan.mehta@`, `priya.nair@`) | patients, admissions, notes, similar cases, prescriptions |
| Admin | `admin@medgraph.test` | patients (including delete), admissions, medication stock, audit log |

## Layout
```
sql/       01 schema, 02 indexes, 03 functions/procedures/triggers, 04 views, 05 alter/drop,
           06 queries by syllabus unit, 07 DML examples, 08 transaction demo (manual), 09 EXPLAIN
scripts/   setup-db, seed, test-db, concurrency-demo, explain-demo
lib/       db (pool, transactions), auth, errors, search (query builder), embed, hooks
app/       pages;  app/api/  route handlers
docs/      DOCUMENTATION.md, DESIGN_THEORY.md, SYLLABUS_MAP.md, DEMO_SCRIPT.md
```

Secrets are read from environment variables only. `.env.local` is git-ignored.

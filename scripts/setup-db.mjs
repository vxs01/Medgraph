// Applies sql/01..05 in order. Use --reset to drop everything first.
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from './env.mjs';

loadEnv();
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

if (process.argv.includes('--reset')) {
  console.log('Dropping existing objects...');
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}
const files = fs.readdirSync(dir).filter((f) => /^0[1-5]_.*\.sql$/.test(f)).sort();
for (const f of files) {
  process.stdout.write(`Running ${f} ... `);
  await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
  console.log('ok');
}
await client.end();
console.log('Database ready.');

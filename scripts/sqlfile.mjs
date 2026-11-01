// Runs a .sql file statement by statement (comments stripped, BEGIN/COMMIT/ROLLBACK skipped).
// Used by the test suite to prove the demo query files are valid.
import fs from 'fs';

export function statementsOf(path) {
  const text = fs
    .readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
  return text
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s && !/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/i.test(s));
}

export async function runFile(client, path) {
  let n = 0;
  for (const sql of statementsOf(path)) {
    try {
      await client.query(sql);
      n++;
    } catch (e) {
      throw new Error(`${path}: ${e.message}\n  in: ${sql.slice(0, 160).replace(/\s+/g, ' ')}`);
    }
  }
  return n;
}

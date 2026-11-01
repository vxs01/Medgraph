import pg from 'pg';

// Return DATE columns as 'YYYY-MM-DD' strings. The default (a JS Date at local midnight) shifts
// birthdays by a day when it is serialised to UTC.
pg.types.setTypeParser(1082, (v) => v);

const g = globalThis;
export const pool = g.__pgPool || new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== 'production') g.__pgPool = pool; // survive hot reloads in dev

export const query = (text, params) => pool.query(text, params);

// BEGIN ... COMMIT around fn(client); any error rolls everything back.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Same, and tells the database who is acting (read by current_app_user() in the audit triggers).
export function withUser(userId, fn) {
  return withTransaction(async (client) => {
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
    return fn(client);
  });
}

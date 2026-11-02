import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { signSession } from '@/lib/auth';

// A real bcrypt hash to compare against when the email is unknown, so the response time
// does not reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export async function POST(req) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });

  const cleanEmail = String(email).toLowerCase().trim();
  const { rows } = await query('SELECT user_id, full_name, role, password_hash FROM users WHERE email = $1', [cleanEmail]);
  const user = rows[0];
  const ok = await bcrypt.compare(String(password), user?.password_hash || DUMMY_HASH);

  if (!user || !ok) {
    await query(`INSERT INTO audit_logs(user_id, action_type, description) VALUES (NULL, 'LOGIN_FAILED', $1)`, [
      `Failed sign-in for ${cleanEmail.slice(0, 100)}`,
    ]);
    return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
  }
  await query(`INSERT INTO audit_logs(user_id, action_type, description) VALUES ($1, 'LOGIN', 'Signed in')`, [user.user_id]);

  const res = NextResponse.json({ role: user.role });
  res.cookies.set('session', await signSession(user), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8,
  });
  return res;
}

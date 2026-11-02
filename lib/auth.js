import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET);

export async function signSession(user) {
  return new SignJWT({ role: user.role, name: user.full_name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.user_id)
    .setExpirationTime('8h')
    .sign(secret());
}

export async function verifySession(token) {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload;
  } catch {
    return null;
  }
}

export async function getSession() {
  const token = cookies().get('session')?.value;
  return token ? verifySession(token) : null;
}

// Usage in a route: const { session, error } = await authorize(['DOCTOR']); if (error) return error;
export async function authorize(roles) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  if (roles && !roles.includes(session.role))
    return { error: NextResponse.json({ error: 'Your role cannot do this' }, { status: 403 }) };
  return { session };
}

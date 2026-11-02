'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import Msg from '@/components/Msg';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/api/auth/login', { method: 'POST', body: form });
      window.location.assign('/');
    } catch (err) {
      setError(err.message); setBusy(false);
    }
  }
  return (
    <div className="login">
      <div className="card">
        <h1>MedGraph</h1>
        <p className="sub">Sign in to the clinical records system.</p>
        <Msg error={error} />
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <label>Email<input type="email" required autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Password<input type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <button className="btn" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}

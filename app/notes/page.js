'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, fmt } from '@/lib/client';
import { useFetch, useFlash } from '@/lib/hooks';
import Msg from '@/components/Msg';

export default function Notes() {
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({ patient_id: '', chief_complaint: '', observation_text: '' });
  const [busy, setBusy] = useState(false);
  const patients = useFetch('/api/patients');
  const notes = useFetch(`/api/notes${filter ? `?patient_id=${filter}` : ''}`);
  const [flash, run] = useFlash();

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const ok = await run(() => api('/api/notes', { method: 'POST', body: form }), 'Note saved. It can now be found by similar-case search.');
    setBusy(false);
    if (ok) { setForm({ ...form, chief_complaint: '', observation_text: '' }); notes.reload(); }
  }
  const remove = async (id) => {
    if (window.confirm('Delete this note?') && (await run(() => api(`/api/notes/${id}`, { method: 'DELETE' }), 'Note deleted.'))) notes.reload();
  };

  return (
    <>
      <h1>Clinical notes</h1>
      <p className="sub">Saving a note turns its text into a 384-number embedding that is stored with it. The first save after the server starts can take a few seconds while the model loads.</p>
      <Msg {...flash} error={flash.error || patients.error || notes.error} />
      <div className="card">
        <h2>New note</h2>
        <form className="form" onSubmit={save}>
          <label className="wide">Patient
            <select required value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })}>
              <option value="">Choose a patient</option>
              {(patients.data || []).map((p) => <option key={p.patient_id} value={p.patient_id}>{p.first_name} {p.last_name} ({p.age})</option>)}
            </select>
          </label>
          <label className="wide">Chief complaint<input required value={form.chief_complaint} onChange={(e) => setForm({ ...form, chief_complaint: e.target.value })} /></label>
          <label className="wide">Observations<textarea required value={form.observation_text} onChange={(e) => setForm({ ...form, observation_text: e.target.value })} /></label>
          <button className="btn" disabled={busy}>{busy ? 'Saving...' : 'Save note'}</button>
        </form>
      </div>
      <div className="card">
        <div className="row">
          <label>Show notes for
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All patients</option>
              {(patients.data || []).map((p) => <option key={p.patient_id} value={p.patient_id}>{p.first_name} {p.last_name}</option>)}
            </select>
          </label>
        </div>
        {(notes.data || []).map((n) => (
          <div className="result" style={{ gridTemplateColumns: '1fr' }} key={n.note_id}>
            <div>
              <h3>{n.chief_complaint}</h3>
              <div className="meta"><Link href={`/patients/${n.patient_id}`}>{n.patient_name}</Link> - {n.doctor_name || 'unknown doctor'} - {fmt(n.created_at)}</div>
              <div>{n.observation_text}</div>
              <div className="note-actions">
                <Link className="btn line small" href={`/search?like=${n.note_id}`} style={{ textDecoration: 'none' }}>Find similar cases</Link>
                {n.mine && <button className="btn line small" onClick={() => remove(n.note_id)}>Delete</button>}
              </div>
            </div>
          </div>
        ))}
        {notes.data && notes.data.length === 0 && <div className="empty">No notes yet.</div>}
      </div>
    </>
  );
}

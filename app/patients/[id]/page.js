'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, fmt, fmtDate } from '@/lib/client';
import { useFetch, useFlash } from '@/lib/hooks';
import { useUser } from '@/components/Shell';
import Msg from '@/components/Msg';

const GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const PILL = { ADMISSION: 'pill warn', DISCHARGE: 'pill ok', NOTE: 'pill', PRESCRIPTION: 'pill' };
const LABEL = { ADMISSION: 'Admitted', DISCHARGE: 'Discharged', NOTE: 'Note', PRESCRIPTION: 'Prescription' };

export default function PatientPage() {
  const { id } = useParams();
  const router = useRouter();
  const user = useUser();
  const { data, error, reload } = useFetch(`/api/patients/${id}`);
  const [flash, run] = useFlash();
  const [form, setForm] = useState(null); // non-null while editing
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (error) return <><Msg error={error} /><Link href="/patients">Back to patients</Link></>;
  if (!data) return <p className="sub">Loading...</p>;
  const { patient: p, current, timeline } = data;

  const startEdit = () => setForm({ ...p, dob: String(p.dob).slice(0, 10) });
  async function save(e) {
    e.preventDefault();
    if (await run(() => api(`/api/patients/${id}`, { method: 'PATCH', body: form }), 'Changes saved.')) { setForm(null); reload(); }
  }
  async function remove() {
    if (!window.confirm(`Delete ${p.first_name} ${p.last_name}? This also deletes their admissions, notes and prescriptions.`)) return;
    if (await run(() => api(`/api/patients/${id}`, { method: 'DELETE' }))) router.push('/patients');
  }

  return (
    <>
      <p style={{ margin: '0 0 8px' }}><Link href="/patients">Patients</Link></p>
      <h1>{p.first_name} {p.last_name}</h1>
      <p className="sub">{current ? <>Admitted to {current.ward_name} on {fmtDate(current.admission_date)}.</> : 'Not currently admitted.'}</p>
      <Msg {...flash} />

      <div className="card">
        {form ? (
          <form className="form" onSubmit={save}>
            <label>First name<input required value={form.first_name} onChange={set('first_name')} /></label>
            <label>Last name<input required value={form.last_name} onChange={set('last_name')} /></label>
            <label>Date of birth<input required type="date" value={form.dob} onChange={set('dob')} /></label>
            <label>Gender<select value={form.gender} onChange={set('gender')}><option value="M">Male</option><option value="F">Female</option><option value="O">Other</option></select></label>
            <label>Blood group<select value={form.blood_group} onChange={set('blood_group')}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select></label>
            <label>Phone<input required value={form.phone_number} onChange={set('phone_number')} /></label>
            <label>Emergency contact<input required value={form.emergency_contact} onChange={set('emergency_contact')} /></label>
            <div className="row" style={{ margin: 0 }}><button className="btn">Save changes</button><button type="button" className="btn line" onClick={() => setForm(null)}>Cancel</button></div>
          </form>
        ) : (
          <>
            <dl className="facts">
              <div><dt>Age</dt><dd>{p.age} ({fmtDate(p.dob)})</dd></div>
              <div><dt>Gender</dt><dd>{p.gender}</dd></div>
              <div><dt>Blood group</dt><dd>{p.blood_group}</dd></div>
              <div><dt>Phone</dt><dd>{p.phone_number}</dd></div>
              <div><dt>Emergency contact</dt><dd>{p.emergency_contact}</dd></div>
            </dl>
            <div className="note-actions">
              <button className="btn line small" onClick={startEdit}>Edit details</button>
              {user.role === 'ADMIN' && <button className="btn danger small" onClick={remove}>Delete patient</button>}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>History</h2>
        {timeline.length === 0 && <div className="empty">Nothing recorded yet.</div>}
        <ul className="timeline">
          {timeline.map((t, i) => (
            <li key={i}>
              <span className="when">{fmt(t.event_time)}</span>
              <span><span className={PILL[t.event_type]}>{LABEL[t.event_type]}</span></span>
              <span>
                {t.summary}{t.doctor_name ? <span className="when"> by {t.doctor_name}</span> : null}
                {t.note_id && <> <Link href={`/search?like=${t.note_id}`}>Find similar cases</Link></>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

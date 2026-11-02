'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import { useFetch, useFlash } from '@/lib/hooks';
import Msg from '@/components/Msg';

const GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const EMPTY = { first_name: '', last_name: '', dob: '', gender: 'M', blood_group: 'O+', phone_number: '', emergency_contact: '' };

export default function Patients() {
  const [q, setQ] = useState('');
  const [bg, setBg] = useState('');
  const [form, setForm] = useState(EMPTY);
  const { data: rows, error, reload } = useFetch(`/api/patients?q=${encodeURIComponent(q)}&blood_group=${encodeURIComponent(bg)}`);
  const [flash, run] = useFlash();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function add(e) {
    e.preventDefault();
    if (await run(() => api('/api/patients', { method: 'POST', body: form }), 'Patient added.')) { setForm(EMPTY); reload(); }
  }

  return (
    <>
      <h1>Patients</h1>
      <p className="sub">Search by name, filter by blood group, or open a patient to see their full history. The database checks every field you enter.</p>
      <Msg {...flash} error={flash.error || error} />
      <div className="card">
        <div className="row">
          <label>Name<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type part of a first or last name" /></label>
          <label>Blood group<select value={bg} onChange={(e) => setBg(e.target.value)}><option value="">Any</option>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select></label>
        </div>
        <div className="tw"><table>
          <thead><tr><th>Name</th><th>Age</th><th>Gender</th><th>Blood group</th><th>Phone</th><th>Status</th></tr></thead>
          <tbody>{(rows || []).map((p) => (
            <tr key={p.patient_id}>
              <td><Link href={`/patients/${p.patient_id}`}>{p.first_name} {p.last_name}</Link></td>
              <td>{p.age}</td><td>{p.gender}</td><td>{p.blood_group}</td><td>{p.phone_number}</td>
              <td>{p.admitted ? <span className="pill warn">Admitted</span> : <span className="pill">Not admitted</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {rows && rows.length === 0 && <div className="empty">No patients match. Clear the filters or add the patient below.</div>}
      </div>
      <div className="card">
        <h2>Add a patient</h2>
        <form className="form" onSubmit={add}>
          <label>First name<input required value={form.first_name} onChange={set('first_name')} /></label>
          <label>Last name<input required value={form.last_name} onChange={set('last_name')} /></label>
          <label>Date of birth<input required type="date" value={form.dob} onChange={set('dob')} /></label>
          <label>Gender<select value={form.gender} onChange={set('gender')}><option value="M">Male</option><option value="F">Female</option><option value="O">Other</option></select></label>
          <label>Blood group<select value={form.blood_group} onChange={set('blood_group')}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select></label>
          <label>Phone<input required value={form.phone_number} onChange={set('phone_number')} placeholder="+91 98450 12345" /></label>
          <label>Emergency contact<input required value={form.emergency_contact} onChange={set('emergency_contact')} placeholder="+91 98860 54321" /></label>
          <button className="btn">Add patient</button>
        </form>
      </div>
    </>
  );
}

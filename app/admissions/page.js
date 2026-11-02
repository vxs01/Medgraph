'use client';
import { useState } from 'react';
import { api, fmt } from '@/lib/client';
import { useFetch, useFlash } from '@/lib/hooks';
import { useUser } from '@/components/Shell';
import Msg from '@/components/Msg';

export default function Admissions() {
  const user = useUser();
  const [history, setHistory] = useState(false);
  const [form, setForm] = useState({ patient_id: '', ward_id: '', doctor_id: '' });
  const [target, setTarget] = useState({}); // admission_id -> ward chosen for a transfer
  const rows = useFetch(`/api/admissions${history ? '?history=1' : ''}`);
  const patients = useFetch('/api/patients');
  const wards = useFetch('/api/wards');
  const doctors = useFetch('/api/doctors');
  const [flash, run] = useFlash();

  const refresh = () => { rows.reload(); patients.reload(); wards.reload(); };
  async function admit(e) {
    e.preventDefault();
    if (await run(() => api('/api/admissions', { method: 'POST', body: form }), 'Patient admitted.')) {
      setForm({ patient_id: '', ward_id: '', doctor_id: '' }); refresh();
    }
  }
  const discharge = async (id) => { if (await run(() => api(`/api/admissions/${id}`, { method: 'PATCH', body: { action: 'discharge' } }), 'Patient discharged and the bed is free again.')) refresh(); };
  const transfer = async (id) => { if (await run(() => api(`/api/admissions/${id}`, { method: 'PATCH', body: { action: 'transfer', ward_id: target[id] } }), 'Patient transferred.')) refresh(); };

  const notAdmitted = (patients.data || []).filter((p) => !p.admitted);
  const err = flash.error || rows.error || patients.error || wards.error;

  return (
    <>
      <h1>Admissions</h1>
      <p className="sub">Admitting calls a database function that locks the ward and refuses when no bed is free. Discharge and transfer are stored procedures; triggers keep the bed counts right.</p>
      <Msg {...flash} error={err} />
      <div className="card">
        <h2>Admit a patient</h2>
        <form className="form" onSubmit={admit}>
          <label>Patient
            <select required value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })}>
              <option value="">Choose a patient</option>
              {notAdmitted.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.first_name} {p.last_name}</option>)}
            </select>
          </label>
          <label>Ward
            <select required value={form.ward_id} onChange={(e) => setForm({ ...form, ward_id: e.target.value })}>
              <option value="">Choose a ward</option>
              {(wards.data || []).map((w) => <option key={w.ward_id} value={w.ward_id}>{w.ward_name} ({w.available_beds} free)</option>)}
            </select>
          </label>
          {user.role === 'ADMIN' && (
            <label>Responsible doctor
              <select required value={form.doctor_id} onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}>
                <option value="">Choose a doctor</option>
                {(doctors.data || []).map((d) => <option key={d.user_id} value={d.user_id}>{d.full_name}</option>)}
              </select>
            </label>
          )}
          <button className="btn">Admit patient</button>
        </form>
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0, alignSelf: 'center' }}>{history ? 'All admissions' : 'Currently admitted'}</h2>
          <button className="btn line small" onClick={() => setHistory(!history)}>{history ? 'Show current only' : 'Show history'}</button>
        </div>
        <div className="tw"><table>
          <thead>
            <tr>
              <th>Patient</th><th>Ward</th><th>Doctor</th><th>Admitted</th>
              {history ? <><th>Discharged</th><th>Status</th></> : <><th>Days</th><th>Move to</th><th></th></>}
            </tr>
          </thead>
          <tbody>
            {(rows.data || []).map((a) => (
              <tr key={a.admission_id}>
                <td>{a.patient_name}</td><td>{a.ward_name || '-'}</td><td>{a.doctor_name || '-'}</td><td>{fmt(a.admission_date)}</td>
                {history ? (
                  <><td>{fmt(a.discharge_date)}</td><td><span className={a.status === 'ADMITTED' ? 'pill warn' : 'pill ok'}>{a.status === 'ADMITTED' ? 'Admitted' : 'Discharged'}</span></td></>
                ) : (
                  <>
                    <td>{a.days_admitted}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <select aria-label={`Transfer ${a.patient_name} to`} value={target[a.admission_id] || ''} onChange={(e) => setTarget({ ...target, [a.admission_id]: e.target.value })}>
                        <option value="">Ward</option>
                        {(wards.data || []).filter((w) => w.ward_id !== a.ward_id).map((w) => <option key={w.ward_id} value={w.ward_id}>{w.ward_name}</option>)}
                      </select>
                      <button className="btn line small" disabled={!target[a.admission_id]} onClick={() => transfer(a.admission_id)}>Move</button>
                    </td>
                    <td><button className="btn line small" onClick={() => discharge(a.admission_id)}>Discharge</button></td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table></div>
        {rows.data && rows.data.length === 0 && <div className="empty">No admissions to show.</div>}
      </div>
    </>
  );
}

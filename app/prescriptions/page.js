'use client';
import { useState } from 'react';
import { api, fmt } from '@/lib/client';
import { useFetch, useFlash } from '@/lib/hooks';
import Msg from '@/components/Msg';

export default function Prescriptions() {
  const [form, setForm] = useState({ patient_id: '', med_id: '', dosage: '', quantity: 1 });
  const rows = useFetch('/api/prescriptions');
  const meds = useFetch('/api/medications');
  const patients = useFetch('/api/patients');
  const [flash, run] = useFlash();
  const med = (meds.data || []).find((m) => m.med_id === form.med_id);

  async function save(e) {
    e.preventDefault();
    if (await run(() => api('/api/prescriptions', { method: 'POST', body: { ...form, quantity: Number(form.quantity) } }), 'Prescription saved and stock updated.')) {
      setForm({ ...form, dosage: '', quantity: 1 }); rows.reload(); meds.reload();
    }
  }
  const cancel = async (id) => {
    if (window.confirm('Cancel this prescription? The units go back into stock.') &&
        (await run(() => api(`/api/prescriptions/${id}`, { method: 'DELETE' }), 'Prescription cancelled and stock restored.'))) { rows.reload(); meds.reload(); }
  };

  return (
    <>
      <h1>Prescriptions</h1>
      <p className="sub">Saving locks the medication row and writes the prescription in one transaction; the database takes the units from stock and refuses if there are not enough. Cancelling puts them back.</p>
      <Msg {...flash} error={flash.error || rows.error || meds.error} />
      <div className="card">
        <h2>New prescription</h2>
        <form className="form" onSubmit={save}>
          <label>Patient
            <select required value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })}>
              <option value="">Choose a patient</option>
              {(patients.data || []).map((p) => <option key={p.patient_id} value={p.patient_id}>{p.first_name} {p.last_name}</option>)}
            </select>
          </label>
          <label>Medication
            <select required value={form.med_id} onChange={(e) => setForm({ ...form, med_id: e.target.value })}>
              <option value="">Choose a medication</option>
              {(meds.data || []).map((m) => <option key={m.med_id} value={m.med_id}>{m.med_name} ({m.stock_quantity} in stock)</option>)}
            </select>
          </label>
          <label>Dosage<input required value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })} placeholder="500mg twice daily" /></label>
          <label>Quantity<input required type="number" min="1" max="1000" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
          <button className="btn">Save prescription</button>
        </form>
        {med && <p className="sub" style={{ margin: '12px 0 0' }}>Unit price {Number(med.unit_price).toFixed(2)}. Total {(Number(med.unit_price) * Number(form.quantity || 0)).toFixed(2)}.</p>}
      </div>
      <div className="card">
        <div className="tw"><table>
          <thead><tr><th>Patient</th><th>Medication</th><th>Dosage</th><th>Qty</th><th>Cost</th><th>Doctor</th><th>Date</th><th></th></tr></thead>
          <tbody>{(rows.data || []).map((r) => (
            <tr key={r.prescription_id}>
              <td>{r.patient_name}</td><td>{r.med_name}</td><td>{r.dosage}</td><td>{r.quantity}</td><td>{Number(r.total_cost).toFixed(2)}</td><td>{r.doctor_name || '-'}</td><td>{fmt(r.prescribed_date)}</td>
              <td><button className="btn line small" onClick={() => cancel(r.prescription_id)}>Cancel</button></td>
            </tr>
          ))}</tbody>
        </table></div>
        {rows.data && rows.data.length === 0 && <div className="empty">No prescriptions yet.</div>}
      </div>
    </>
  );
}

'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { useFetch, useFlash } from '@/lib/hooks';
import { useUser } from '@/components/Shell';
import Msg from '@/components/Msg';

export default function Medications() {
  const user = useUser();
  const { data: meds, error, reload } = useFetch('/api/medications');
  const [form, setForm] = useState({ med_name: '', quantity: '', unit_price: '' });
  const [flash, run] = useFlash();

  async function save(e) {
    e.preventDefault();
    if (await run(() => api('/api/medications', { method: 'POST', body: form }), 'Saved. A new name is added; an existing name gets the quantity added to its stock.')) {
      setForm({ med_name: '', quantity: '', unit_price: '' }); reload();
    }
  }

  return (
    <>
      <h1>Medications</h1>
      <p className="sub">{user.role === 'ADMIN' ? 'Add a new medication, or restock an existing one. Stock can never go below zero.' : 'Current stock and prices.'}</p>
      <Msg {...flash} error={flash.error || error} />
      {user.role === 'ADMIN' && (
        <div className="card">
          <h2>Add or restock</h2>
          <form className="form" onSubmit={save}>
            <label>Medication name<input required value={form.med_name} onChange={(e) => setForm({ ...form, med_name: e.target.value })} /></label>
            <label>Units to add<input required type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
            <label>Unit price<input required type="number" min="0.01" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} /></label>
            <button className="btn">Save</button>
          </form>
        </div>
      )}
      <div className="card"><div className="tw"><table>
        <thead><tr><th>Medication</th><th>In stock</th><th>Unit price</th>{user.role === 'ADMIN' && <th></th>}</tr></thead>
        <tbody>{(meds || []).map((m) => (
          <tr key={m.med_id}>
            <td>{m.med_name}</td>
            <td>{m.stock_quantity < 100 ? <span className="pill warn">{m.stock_quantity}</span> : m.stock_quantity}</td>
            <td>{Number(m.unit_price).toFixed(2)}</td>
            {user.role === 'ADMIN' && <td><button className="btn line small" onClick={() => setForm({ med_name: m.med_name, quantity: '', unit_price: String(m.unit_price) })}>Restock</button></td>}
          </tr>
        ))}</tbody>
      </table></div></div>
    </>
  );
}

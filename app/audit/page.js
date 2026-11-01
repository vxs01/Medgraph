'use client';
import { useState } from 'react';
import { fmt } from '@/lib/client';
import { useFetch } from '@/lib/hooks';
import Msg from '@/components/Msg';

export default function Audit() {
  const [type, setType] = useState('');
  const { data, error } = useFetch(`/api/audit?type=${encodeURIComponent(type)}`);
  return (
    <>
      <h1>Audit log</h1>
      <p className="sub">Sign-ins and searches are recorded by the application. Everything else is recorded by database triggers, including the user who acted.</p>
      <Msg error={error} />
      <div className="card">
        <div className="row">
          <label>Action<select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All actions</option>
            {(data?.types || []).map((t) => <option key={t}>{t}</option>)}
          </select></label>
        </div>
        <div className="tw"><table>
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>{(data?.rows || []).map((r) => (
            <tr key={r.log_id}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmt(r.logged_at)}</td><td>{r.user_name}</td>
              <td><span className={r.action_type === 'LOGIN_FAILED' ? 'pill danger' : 'pill'}>{r.action_type}</span></td><td>{r.description}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {data && data.rows.length === 0 && <div className="empty">No entries for this filter.</div>}
      </div>
    </>
  );
}

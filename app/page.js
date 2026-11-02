'use client';
import { useFetch } from '@/lib/hooks';
import Msg from '@/components/Msg';

const level = (pct) => (pct >= 90 ? 'bar hot' : pct >= 60 ? 'bar mid' : 'bar');

export default function Dashboard() {
  const { data: d, error } = useFetch('/api/dashboard');
  if (error) return <Msg error={error} />;
  if (!d) return <p className="sub">Loading...</p>;
  const peak = Math.max(1, ...d.perDay.map((x) => x.admissions));

  return (
    <>
      <h1>Dashboard</h1>
      <p className="sub">Live figures from the database views.</p>
      {d.inconsistentWards.length > 0 && (
        <Msg error={`Bed counts do not match admissions for: ${d.inconsistentWards.map((w) => `${w.ward_name} (recorded ${w.recorded}, actual ${w.actual})`).join(', ')}.`} />
      )}
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="stat"><b>{d.counts.patients}</b><span>Patients</span></div>
        <div className="stat"><b>{d.counts.admitted}</b><span>Currently admitted</span></div>
        <div className="stat"><b>{d.counts.notes}</b><span>Clinical notes</span></div>
        <div className="stat"><b>{d.counts.prescriptions}</b><span>Prescriptions</span></div>
      </div>
      <div className="grid g2">
        <div className="card">
          <h2>Ward occupancy</h2>
          {d.wards.map((w) => (
            <div className="wardrow" key={w.ward_id}>
              <div className="top"><span>{w.ward_name}</span><span>{w.occupied_beds} of {w.total_capacity} beds</span></div>
              <div className={level(Number(w.occupancy_pct))} role="img" aria-label={`${w.occupancy_pct}% full`}><i style={{ width: `${Number(w.occupancy_pct)}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="card">
          <h2>Admissions, last 7 days</h2>
          <div className="days">
            {d.perDay.map((x) => (
              <div key={x.label}><span>{x.admissions}</span><i style={{ height: `${(x.admissions / peak) * 70}px` }} /><span>{x.label}</span></div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2>Doctor workload</h2>
          <div className="tw"><table>
            <thead><tr><th>Doctor</th><th>Admitted now</th><th>Notes</th><th>Prescriptions</th></tr></thead>
            <tbody>{d.workload.map((w) => <tr key={w.full_name}><td>{w.full_name}</td><td>{w.active_patients}</td><td>{w.notes_written}</td><td>{w.prescriptions_written}</td></tr>)}</tbody>
          </table></div>
        </div>
        <div className="card">
          <h2>Most prescribed</h2>
          <table>
            <thead><tr><th>Medication</th><th>Units</th><th>Share</th></tr></thead>
            <tbody>{d.topMeds.map((m) => <tr key={m.med_name}><td>{m.med_name}</td><td>{m.units}</td><td>{m.percent}%</td></tr>)}</tbody>
          </table>
        </div>
        <div className="card">
          <h2>Low stock (under 100 units)</h2>
          {d.lowStock.length === 0 ? <div className="empty">Every medication has 100 units or more.</div> : (
            <table>
              <thead><tr><th>Medication</th><th>In stock</th></tr></thead>
              <tbody>{d.lowStock.map((m) => <tr key={m.med_name}><td>{m.med_name}</td><td><span className="pill warn">{m.stock_quantity}</span></td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

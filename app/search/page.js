'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, fmtDate } from '@/lib/client';
import Msg from '@/components/Msg';

const EXAMPLES = [
  'older patient becoming confused and withdrawn over months',
  'sudden aggressive behaviour with poor sleep',
  'losing weight and muscle with tremor',
  'difficulty breathing that gets worse at night',
];
const MODES = [['semantic', 'Meaning'], ['keyword', 'Keywords'], ['hybrid', 'Both']];
const HEADING = {
  semantic: 'Closest cases by meaning',
  keyword: 'Notes containing every word you typed',
  hybrid: 'Best matches by meaning and keywords combined',
  like: 'Cases similar to the chosen note',
};

// ts_headline marks matches with [[ ]]; render them as <mark> without injecting HTML
function Highlighted({ text }) {
  return text.split(/(\[\[.*?\]\])/g).map((part, i) =>
    part.startsWith('[[') ? <mark key={i}>{part.slice(2, -2)}</mark> : <span key={i}>{part}</span>);
}

function SearchPage() {
  const likeId = useSearchParams().get('like');
  const [text, setText] = useState('');
  const [mode, setMode] = useState('semantic');
  const [k, setK] = useState(5);
  const [f, setF] = useState({ minAge: '', maxAge: '', gender: '', since: '', admittedOnly: false });
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(override = {}) {
    setError(''); setBusy(true);
    try {
      setRes(await api('/api/search', { method: 'POST', body: { query: text, mode, k, ...f, ...override } }));
    } catch (e) { setError(e.message); setRes(null); }
    setBusy(false);
  }
  const started = useRef(false);
  useEffect(() => {
    if (likeId && !started.current) { started.current = true; run({ like: likeId }); }
  }, [likeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (key) => (e) => setF({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = (e) => { e.preventDefault(); run(); };

  return (
    <>
      <h1>Similar cases</h1>
      <p className="sub">Describe a case in your own words. Searching by meaning finds past notes that say the same thing differently; keyword search needs the same words. Filters narrow the results using ordinary patient data.</p>
      <Msg error={error} />
      {likeId && busy && !res && <div className="banner">Looking for notes similar to the one you chose...</div>}
      <div className="card">
        <form onSubmit={submit}>
          <label>Describe the case
            <textarea required={!likeId} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. behavioural changes and physical decline over several weeks" />
          </label>
          <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
            <div style={{ flex: '0 0 auto' }}>
              <div className="seg" role="group" aria-label="Search by">
                {MODES.map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}
              </div>
            </div>
            <label style={{ flex: '0 0 100px' }}>Results<select value={k} onChange={(e) => setK(Number(e.target.value))}>{[3, 5, 10].map((n) => <option key={n}>{n}</option>)}</select></label>
            <button className="btn" disabled={busy}>{busy ? 'Searching...' : 'Find similar cases'}</button>
          </div>
          <div className="filters">
            <label>Age from<input type="number" min="0" max="120" value={f.minAge} onChange={setFilter('minAge')} /></label>
            <label>Age to<input type="number" min="0" max="120" value={f.maxAge} onChange={setFilter('maxAge')} /></label>
            <label>Gender<select value={f.gender} onChange={setFilter('gender')}><option value="">Any</option><option value="M">Male</option><option value="F">Female</option><option value="O">Other</option></select></label>
            <label>Notes since<input type="date" value={f.since} onChange={setFilter('since')} /></label>
            <label className="check"><input type="checkbox" checked={f.admittedOnly} onChange={setFilter('admittedOnly')} />Admitted now</label>
          </div>
        </form>
        <div className="chips">
          {EXAMPLES.map((x) => <button key={x} className="chip" type="button" onClick={() => { setText(x); run({ query: x, like: null }); }}>{x}</button>)}
        </div>
      </div>

      {res && (
        <div className="card">
          <h2>{HEADING[res.mode]}</h2>
          {res.source && <p className="sub" style={{ marginBottom: 12 }}>Source note: "{res.source.chief_complaint}" ({res.source.patient_name}). <Link href="/search">Search by description instead</Link></p>}
          {res.results.length === 0 && <div className="empty">No notes matched.{res.mode === 'keyword' ? ' Keyword search needs every word to appear in a note. Try searching by meaning.' : ' Try loosening the filters.'}</div>}
          {res.results.map((r) => {
            const semantic = res.mode === 'semantic' || res.mode === 'like';
            return (
              <div className="result" key={r.note_id}>
                <div className="score">
                  <b>{Number(r.score).toFixed(semantic ? 2 : res.mode === 'keyword' ? 2 : 1)}</b>
                  <span>{semantic ? 'cosine similarity' : res.mode === 'keyword' ? 'text rank' : 'combined score'}</span>
                  {semantic && <div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${Math.max(0, Number(r.score)) * 100}%` }} /></div>}
                </div>
                <div>
                  <h3>{r.chief_complaint}</h3>
                  <div className="meta">
                    <Link href={`/patients/${r.patient_id}`}>{r.patient_name}</Link>, {r.age}{r.gender} - {fmtDate(r.created_at)}
                    {res.mode === 'hybrid' && <> - meaning #{r.semantic_rank ?? 'none'}, keywords #{r.keyword_rank ?? 'none'}</>}
                  </div>
                  <div>{r.excerpt ? <Highlighted text={r.excerpt} /> : r.observation_text}</div>
                  <div className="note-actions"><Link href={`/search?like=${r.note_id}`} onClick={() => { started.current = false; }}>More like this</Link></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="sub">Loading...</p>}><SearchPage /></Suspense>;
}

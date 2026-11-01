export default function Msg({ error, ok }) {
  if (error) return <div className="msg err" role="alert">{error}</div>;
  if (ok) return <div className="msg ok" role="status">{ok}</div>;
  return null;
}

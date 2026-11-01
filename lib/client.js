// Browser helpers: fetch wrapper, date formatting
export async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
export const fmt = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '-');
export const fmtDate = (d) => {
  if (!d) return '-';
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); // a calendar date has no timezone: do not shift it
  const date = plain ? new Date(+plain[1], +plain[2] - 1, +plain[3]) : new Date(d);
  return date.toLocaleDateString([], { dateStyle: 'medium' });
};

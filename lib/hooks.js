'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './client';

// Loads a URL on mount and whenever it changes. Pass null to skip.
export function useFetch(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    if (!url) return;
    try {
      setData(await api(url));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [url]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, reload };
}

// run(fn, 'Saved.') calls fn, shows the success message or the error, and returns true on success.
export function useFlash() {
  const [flash, setFlash] = useState({});
  const run = useCallback(async (fn, okMessage) => {
    setFlash({});
    try {
      await fn();
      if (okMessage) setFlash({ ok: okMessage });
      return true;
    } catch (e) {
      setFlash({ error: e.message });
      return false;
    }
  }, []);
  return [flash, run];
}

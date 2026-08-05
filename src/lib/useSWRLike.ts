'use client';

import { useEffect, useState, useCallback } from 'react';

// Minimal fetch-on-mount hook so pages don't need a full data-fetching
// library for what's a fairly small internal tool. Returns { data, loading,
// error, refresh }.
export default function useSWRLike<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request to ${url} failed`);
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

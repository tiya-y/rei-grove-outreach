'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWRLike from '@/lib/useSWRLike';
import type { Prospect, ProspectStage } from '@/types';
import { PROSPECT_STAGES } from '@/types';
import ScoreBadge from '@/components/ScoreBadge';
import StageBadge from '@/components/StageBadge';

export default function ProspectsPage() {
  const { data, loading, refresh } = useSWRLike<{ prospects: Prospect[] }>('/api/prospects');
  const [stageFilter, setStageFilter] = useState<ProspectStage | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | Prospect['prospect_type']>('all');
  const [search, setSearch] = useState('');

  const prospects = useMemo(() => {
    let list = data?.prospects ?? [];
    if (stageFilter !== 'all') list = list.filter((p) => p.stage === stageFilter);
    if (typeFilter !== 'all') list = list.filter((p) => p.prospect_type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [data, stageFilter, typeFilter, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Prospects</h1>
        <Link href="/prospects/new" className="btn-primary">
          + Add prospect
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search by name or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input max-w-xs" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
          <option value="all">All types</option>
          <option value="partner">Partner (company)</option>
          <option value="creator">Creator</option>
          <option value="affiliate">Affiliate</option>
        </select>
        <select className="input max-w-xs" value={stageFilter} onChange={(e) => setStageFilter(e.target.value as typeof stageFilter)}>
          <option value="all">All stages</option>
          {PROSPECT_STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="btn-secondary" onClick={() => refresh()}>
          Refresh
        </button>
      </div>

      <div className="card overflow-hidden p-0">
        {loading && <p className="p-4 text-sm text-gray-400">Loading…</p>}
        {!loading && prospects.length === 0 && <p className="p-4 text-sm text-gray-400">No prospects match these filters.</p>}
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Score</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {prospects.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/prospects/${p.id}`} className="font-medium text-grove-dark hover:underline">
                    {p.name}
                  </Link>
                  {p.disqualified && <div className="text-xs text-red-600">Disqualified — {p.disqualify_reason}</div>}
                </td>
                <td className="px-4 py-3 capitalize text-gray-600">{p.prospect_type}</td>
                <td className="px-4 py-3 text-gray-600">{p.category ?? '—'}</td>
                <td className="px-4 py-3">
                  <ScoreBadge score={p.score} tier={p.score_breakdown && 'tier' in p.score_breakdown ? (p.score_breakdown as { tier: string }).tier : null} />
                </td>
                <td className="px-4 py-3">
                  <StageBadge stage={p.stage} />
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">{p.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

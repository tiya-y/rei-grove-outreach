'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWRLike from '@/lib/useSWRLike';
import type { Prospect, ProspectStage } from '@/types';
import { OUTREACH_STAGES, PROSPECT_STAGES } from '@/types';
import ScoreBadge from '@/components/ScoreBadge';
import StageBadge from '@/components/StageBadge';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export default function OutreachPage() {
  const { data, loading, refresh } = useSWRLike<{ prospects: Prospect[] }>('/api/prospects');
  const [stageFilter, setStageFilter] = useState<ProspectStage | 'all'>('all');
  const [search, setSearch] = useState('');

  const prospects = useMemo(() => {
    let list = (data?.prospects ?? []).filter((p) => OUTREACH_STAGES.includes(p.stage));
    if (stageFilter !== 'all') list = list.filter((p) => p.stage === stageFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [data, stageFilter, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Outreach</h1>
        <p className="text-sm text-gray-500">Approved prospects — generate outreach, send it yourself, and mark it sent.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search by name or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input max-w-xs" value={stageFilter} onChange={(e) => setStageFilter(e.target.value as typeof stageFilter)}>
          <option value="all">All stages</option>
          {PROSPECT_STAGES.filter((s) => OUTREACH_STAGES.includes(s.key)).map((s) => (
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
        {!loading && prospects.length === 0 && (
          <p className="p-4 text-sm text-gray-400">
            Nothing here yet. Approve a prospect from <Link href="/search" className="underline">Prospect Search</Link> to move it into outreach.
          </p>
        )}
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Score</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2">Last contacted</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {prospects.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/prospects/${p.id}`} className="font-medium text-grove-dark hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3 capitalize text-gray-600">{p.prospect_type}</td>
                <td className="px-4 py-3">
                  <ScoreBadge score={p.score} tier={p.score_breakdown && 'tier' in p.score_breakdown ? (p.score_breakdown as { tier: string }).tier : null} />
                </td>
                <td className="px-4 py-3">
                  <StageBadge stage={p.stage} />
                </td>
                <td className="px-4 py-3 text-gray-500">{formatDate(p.last_contacted_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

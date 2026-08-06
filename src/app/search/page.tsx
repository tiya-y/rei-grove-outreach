'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWRLike from '@/lib/useSWRLike';
import type { Prospect, ProspectStage } from '@/types';
import { PROSPECT_STAGES } from '@/types';
import ScoreBadge from '@/components/ScoreBadge';
import StageBadge from '@/components/StageBadge';

// Prospects that haven't been approved for outreach yet — this is the pool
// Prospect Search searches, scores, and approves out of. Disqualified
// ("pass") prospects stay visible here too, since they were rejected before
// ever reaching outreach.
const SEARCH_POOL_STAGES: ProspectStage[] = ['new', 'researched', 'pass'];

function SearchPageInner() {
  const { data, loading, refresh } = useSWRLike<{ prospects: Prospect[] }>('/api/prospects');
  const searchParams = useSearchParams();
  const batchId = searchParams.get('batch');

  const [stageFilter, setStageFilter] = useState<ProspectStage | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | Prospect['prospect_type']>('all');
  const [search, setSearch] = useState('');

  const prospects = useMemo(() => {
    let list = data?.prospects ?? [];
    if (batchId) {
      // Batch drill-down from History — show that batch's full roster
      // regardless of current stage, ignoring the search-pool filter below.
      list = list.filter((p) => p.batch_id === batchId);
    } else {
      list = list.filter((p) => SEARCH_POOL_STAGES.includes(p.stage));
    }
    if (stageFilter !== 'all') list = list.filter((p) => p.stage === stageFilter);
    if (typeFilter !== 'all') list = list.filter((p) => p.prospect_type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [data, stageFilter, typeFilter, search, batchId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Prospect Search</h1>
          <p className="text-sm text-gray-500">
            {batchId ? (
              <>
                Showing one imported batch. <Link href="/search" className="underline">Clear</Link>
              </>
            ) : (
              'Search, score, and approve prospects for outreach.'
            )}
          </p>
        </div>
        <Link href="/search/new" className="btn-primary">
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
          {PROSPECT_STAGES.filter((s) => batchId || SEARCH_POOL_STAGES.includes(s.key)).map((s) => (
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

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-400">Loading…</p>}>
      <SearchPageInner />
    </Suspense>
  );
}

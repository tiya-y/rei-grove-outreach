'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWRLike from '@/lib/useSWRLike';
import type { Prospect } from '@/types';
import ScoreBadge from '@/components/ScoreBadge';
import StageBadge from '@/components/StageBadge';

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="text-2xl font-semibold text-grove-dark">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const { data, loading } = useSWRLike<{ prospects: Prospect[] }>('/api/prospects');
  const [topProspects, setTopProspects] = useState<Prospect[]>([]);

  useEffect(() => {
    if (!data?.prospects) return;
    const sorted = [...data.prospects]
      .filter((p) => !p.disqualified)
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      .slice(0, 8);
    setTopProspects(sorted);
  }, [data]);

  const prospects = data?.prospects ?? [];
  const counts = {
    total: prospects.length,
    new: prospects.filter((p) => p.stage === 'new').length,
    reached_out: prospects.filter((p) => p.stage === 'reached_out').length,
    replied: prospects.filter((p) => p.stage === 'replied').length,
    in_discussion: prospects.filter((p) => p.stage === 'in_discussion').length,
    live: prospects.filter((p) => p.stage === 'partner_live' || p.stage === 'affiliate_active').length,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Pipeline overview</h1>
        <p className="text-sm text-gray-500">Cold outreach for REI Grove partnership, affiliate, and creator prospects.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <StatCard label="Total prospects" value={counts.total} />
        <StatCard label="New" value={counts.new} />
        <StatCard label="Reached out" value={counts.reached_out} />
        <StatCard label="Replied" value={counts.replied} />
        <StatCard label="In discussion" value={counts.in_discussion} />
        <StatCard label="Live" value={counts.live} />
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Top-scored prospects</h2>
          <Link href="/prospects" className="text-sm text-grove-dark hover:underline">
            View all →
          </Link>
        </div>
        {loading && <p className="text-sm text-gray-400">Loading…</p>}
        {!loading && topProspects.length === 0 && (
          <p className="text-sm text-gray-400">
            No scored prospects yet. <Link href="/prospects/new" className="underline">Add one</Link> or connect an n8n discovery workflow (see Settings).
          </p>
        )}
        <div className="divide-y">
          {topProspects.map((p) => (
            <Link key={p.id} href={`/prospects/${p.id}`} className="flex items-center justify-between py-3 hover:bg-gray-50">
              <div>
                <div className="font-medium text-gray-900">{p.name}</div>
                <div className="text-xs text-gray-500">{p.category ?? p.prospect_type}</div>
              </div>
              <div className="flex items-center gap-3">
                <StageBadge stage={p.stage} />
                <ScoreBadge score={p.score} tier={p.score_breakdown && 'tier' in p.score_breakdown ? (p.score_breakdown as { tier: string }).tier : null} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

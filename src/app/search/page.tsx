'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import useSWRLike from '@/lib/useSWRLike';
import type { Prospect, ProspectStage } from '@/types';
import { PROSPECT_STAGES } from '@/types';
import { CREATOR_DISCOVERY_NICHES } from '@/lib/rei-grove-content';
import ScoreBadge from '@/components/ScoreBadge';
import StageBadge from '@/components/StageBadge';

const NICHE_LABEL: Record<string, string> = Object.fromEntries(CREATOR_DISCOVERY_NICHES.map((n) => [n.key, n.label]));

interface CompetitorSuggestion {
  domain: string;
  domainRating: number | null;
  traffic: number | null;
}

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
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoverMode, setDiscoverMode] = useState<'keyword' | 'backlinks'>('keyword');

  // Keyword mode
  const [discoverNiche, setDiscoverNiche] = useState(CREATOR_DISCOVERY_NICHES[0].key);
  const [resultType, setResultType] = useState<'all' | 'organic' | 'video' | 'discussion'>('all');
  const [discovering, setDiscovering] = useState(false);

  // Backlinks mode
  const [referenceDomain, setReferenceDomain] = useState('biggerpockets.com');
  const [backlinksNiche, setBacklinksNiche] = useState('');
  const [findingCompetitors, setFindingCompetitors] = useState(false);
  const [competitorSuggestions, setCompetitorSuggestions] = useState<CompetitorSuggestion[]>([]);
  const [findingBacklinks, setFindingBacklinks] = useState(false);

  async function runDiscovery() {
    setDiscovering(true);
    try {
      const res = await fetch('/api/discovery/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nicheKey: discoverNiche, resultType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (json.created > 0) {
        toast.success(`Found ${json.created} new prospect${json.created === 1 ? '' : 's'} — added to Prospect Search.`);
      } else {
        toast(json.message ?? 'No new prospects found this run — everyone found already exists or was disqualified.');
      }
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Discovery search failed');
    } finally {
      setDiscovering(false);
    }
  }

  async function runFindCompetitors() {
    setFindingCompetitors(true);
    setCompetitorSuggestions([]);
    try {
      const res = await fetch('/api/discovery/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: referenceDomain }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if ((json.competitors ?? []).length === 0) {
        toast('No competitor domains found for that domain.');
      }
      setCompetitorSuggestions(json.competitors ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Competitor lookup failed');
    } finally {
      setFindingCompetitors(false);
    }
  }

  async function runBacklinkDiscovery() {
    setFindingBacklinks(true);
    try {
      const res = await fetch('/api/discovery/backlinks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceDomain, nicheKey: backlinksNiche || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (json.created > 0) {
        toast.success(`Found ${json.created} new prospect${json.created === 1 ? '' : 's'} — added to Prospect Search.`);
      } else {
        toast(json.message ?? 'No new prospects found this run — everyone found already exists or was disqualified.');
      }
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backlink search failed');
    } finally {
      setFindingBacklinks(false);
    }
  }

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
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => setDiscoverOpen((o) => !o)}>
            Search for prospects
          </button>
        </div>
      </div>

      {discoverOpen && (
        <div className="card space-y-4">
          <div className="flex gap-2">
            <button
              className={discoverMode === 'keyword' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setDiscoverMode('keyword')}
            >
              Keyword search
            </button>
            <button
              className={discoverMode === 'backlinks' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setDiscoverMode('backlinks')}
            >
              Competitor backlinks
            </button>
          </div>

          {discoverMode === 'keyword' ? (
            <>
              <p className="text-sm text-gray-500">
                Uses Ahrefs to find real, currently-ranking websites, YouTube videos, or forum threads for the niche below (no
                guessing or invented names) and adds any new ones as prospects for you to review and reclassify. Content quality
                and format vary run to run and won&apos;t always hit the target count exactly.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label">Niche</label>
                  <select className="input min-w-[22rem]" value={discoverNiche} onChange={(e) => setDiscoverNiche(e.target.value)}>
                    {CREATOR_DISCOVERY_NICHES.map((n) => (
                      <option key={n.key} value={n.key}>
                        {n.label} — target {n.targetCount} ({n.affiliateFitNote})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Where to look</label>
                  <select className="input" value={resultType} onChange={(e) => setResultType(e.target.value as typeof resultType)}>
                    <option value="all">All (websites, videos, forums)</option>
                    <option value="organic">Websites &amp; blogs</option>
                    <option value="video">YouTube videos</option>
                    <option value="discussion">Forums &amp; discussions</option>
                  </select>
                </div>
                <button className="btn-primary" onClick={runDiscovery} disabled={discovering}>
                  {discovering ? 'Searching…' : 'Find prospects'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                Finds real sites that already link to a comparable real-estate resource (e.g. BiggerPockets) using Ahrefs&apos;
                backlink data — sites already engaging with similar content are natural partnership targets. &quot;Find similar
                competitors&quot; suggests other reference domains to try.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label">Reference domain</label>
                  <input
                    className="input min-w-[16rem]"
                    value={referenceDomain}
                    onChange={(e) => setReferenceDomain(e.target.value)}
                    placeholder="biggerpockets.com"
                  />
                </div>
                <button className="btn-secondary" onClick={runFindCompetitors} disabled={findingCompetitors || !referenceDomain.trim()}>
                  {findingCompetitors ? 'Looking…' : 'Find similar competitors'}
                </button>
                <div>
                  <label className="label">Tag with niche (optional)</label>
                  <select className="input min-w-[18rem]" value={backlinksNiche} onChange={(e) => setBacklinksNiche(e.target.value)}>
                    <option value="">No niche tag</option>
                    {CREATOR_DISCOVERY_NICHES.map((n) => (
                      <option key={n.key} value={n.key}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn-primary" onClick={runBacklinkDiscovery} disabled={findingBacklinks || !referenceDomain.trim()}>
                  {findingBacklinks ? 'Searching…' : 'Find prospects'}
                </button>
              </div>
              {competitorSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {competitorSuggestions.map((c) => (
                    <button
                      key={c.domain}
                      className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:border-grove-dark hover:text-grove-dark"
                      onClick={() => setReferenceDomain(c.domain)}
                    >
                      {c.domain} {c.domainRating != null ? `(DR ${c.domainRating})` : ''}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="card space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Other places to look</h2>
        <p className="text-sm text-gray-500">
          Not automated here — no public API for either of these, so they need a person browsing manually:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-500">
          <li>
            <strong className="text-gray-700">Paywalled creator/influencer databases</strong> — e.g. Favikon, Collabstr. Subscription
            tools for searching real estate content creators directly by niche/follower count.
          </li>
          <li>
            <strong className="text-gray-700">Google Ads → Tools → YouTube Creator Partnerships</strong> (Google&apos;s
            BrandConnect hub) — log into Innago&apos;s Google Ads account to browse/search YouTube creators by niche and audience.
          </li>
        </ul>
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
              <th className="px-4 py-2">Niche</th>
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
                <td className="px-4 py-3 text-gray-600">{p.niche ? NICHE_LABEL[p.niche] ?? p.niche : '—'}</td>
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

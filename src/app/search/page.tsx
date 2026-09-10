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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoverMode, setDiscoverMode] = useState<'keyword' | 'backlinks' | 'contacts' | 'youtube' | 'import'>('keyword');

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

  // Contacts mode (named individuals, not sites, found in backlink data)
  const [contactsDomain, setContactsDomain] = useState('biggerpockets.com');
  const [contactKind, setContactKind] = useState<'all' | 'byline' | 'podcast_guest'>('all');
  const [contactsNiche, setContactsNiche] = useState('');
  const [findingContacts, setFindingContacts] = useState(false);

  // YouTube channels mode
  const [youtubeNiche, setYoutubeNiche] = useState(CREATOR_DISCOVERY_NICHES[0].key);
  const [findingYoutube, setFindingYoutube] = useState(false);

  // Import mode (paste results from Heepsy, Google Ads, or other manual research)
  const [importMethod, setImportMethod] = useState<'paste' | 'csv'>('paste');
  const [importText, setImportText] = useState('');
  const [importCsvText, setImportCsvText] = useState('');
  const [importCsvFileName, setImportCsvFileName] = useState('');
  const [importSourceLabel, setImportSourceLabel] = useState('Heepsy');
  const [importNiche, setImportNiche] = useState('');
  const [importing, setImporting] = useState(false);

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

  async function runContactsDiscovery() {
    setFindingContacts(true);
    try {
      const res = await fetch('/api/discovery/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceDomain: contactsDomain, kind: contactKind, nicheKey: contactsNiche || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (json.created > 0) {
        toast.success(`Found ${json.created} new contact${json.created === 1 ? '' : 's'} — added to Prospect Search.`);
      } else {
        toast(json.message ?? 'No new contacts found this run — everyone found already exists or was disqualified.');
      }
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Contact search failed');
    } finally {
      setFindingContacts(false);
    }
  }

  async function runYoutubeDiscovery() {
    setFindingYoutube(true);
    try {
      const res = await fetch('/api/discovery/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nicheKey: youtubeNiche }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (json.created > 0) {
        toast.success(`Found ${json.created} new channel${json.created === 1 ? '' : 's'} — added to Prospect Search.`);
      } else {
        toast(json.message ?? 'No new channels found this run — everyone found already exists or was disqualified.');
      }
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'YouTube search failed');
    } finally {
      setFindingYoutube(false);
    }
  }

  async function handleCsvFileSelect(file: File | undefined) {
    if (!file) return;
    setImportCsvFileName(file.name);
    setImportCsvText(await file.text());
  }

  async function runImport() {
    const usingCsv = importMethod === 'csv';
    if (usingCsv && !importCsvText.trim()) {
      toast.error('Choose a CSV file first.');
      return;
    }
    if (!usingCsv && !importText.trim()) {
      toast.error('Paste at least one prospect first.');
      return;
    }
    setImporting(true);
    try {
      const res = await fetch('/api/discovery/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          usingCsv
            ? { csv: importCsvText, sourceLabel: importSourceLabel, nicheKey: importNiche || undefined }
            : { text: importText, sourceLabel: importSourceLabel, nicheKey: importNiche || undefined }
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (json.created > 0) {
        toast.success(`Added ${json.created} new prospect${json.created === 1 ? '' : 's'} — imported from ${importSourceLabel}.`);
        setImportText('');
        setImportCsvText('');
        setImportCsvFileName('');
      } else {
        toast(json.message ?? 'Nothing new added — everyone in the list already exists or was disqualified.');
      }
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible(ids: string[], allSelected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function bulkDelete() {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!confirm(`Delete ${count} prospect${count === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setBulkWorking(true);
    try {
      const res = await fetch('/api/prospects', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(selectedIds) }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(`Deleted ${json.deleted} prospect${json.deleted === 1 ? '' : 's'}.`);
      setSelectedIds(new Set());
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBulkWorking(false);
    }
  }

  async function bulkSetStage(stage: 'approved' | 'pass') {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkWorking(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => fetch(`/api/prospects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage }) }))
      );
      const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length;
      if (failed > 0) toast.error(`${failed} of ${ids.length} failed to update.`);
      else toast.success(stage === 'approved' ? `Approved ${ids.length} prospect${ids.length === 1 ? '' : 's'} — moved to Outreach.` : `Passed on ${ids.length} prospect${ids.length === 1 ? '' : 's'}.`);
      setSelectedIds(new Set());
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBulkWorking(false);
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
          <div className="flex flex-wrap gap-2">
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
            <button
              className={discoverMode === 'contacts' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setDiscoverMode('contacts')}
            >
              Contacts (bylines &amp; guests)
            </button>
            <button
              className={discoverMode === 'youtube' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setDiscoverMode('youtube')}
            >
              YouTube channels
            </button>
            <button
              className={discoverMode === 'import' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setDiscoverMode('import')}
            >
              Add from research
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
          ) : discoverMode === 'backlinks' ? (
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
          ) : discoverMode === 'contacts' ? (
            <>
              <p className="text-sm text-gray-500">
                Finds named INDIVIDUALS, not sites, in a reference domain&apos;s backlink data (e.g. BiggerPockets): either the
                bylined author of an article that links to it, or a podcast/interview guest named in that page&apos;s title.
                Adds each person directly as a prospect with their name split for personalized outreach — Ahrefs doesn&apos;t
                expose email/LinkedIn, so contact info still needs enrichment (e.g. Apollo) before sending.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label">Reference domain</label>
                  <input
                    className="input min-w-[16rem]"
                    value={contactsDomain}
                    onChange={(e) => setContactsDomain(e.target.value)}
                    placeholder="biggerpockets.com"
                  />
                </div>
                <div>
                  <label className="label">Where to look</label>
                  <select className="input" value={contactKind} onChange={(e) => setContactKind(e.target.value as typeof contactKind)}>
                    <option value="all">Both</option>
                    <option value="byline">Bylined authors</option>
                    <option value="podcast_guest">Podcast/interview guests</option>
                  </select>
                </div>
                <div>
                  <label className="label">Tag with niche (optional)</label>
                  <select className="input min-w-[18rem]" value={contactsNiche} onChange={(e) => setContactsNiche(e.target.value)}>
                    <option value="">No niche tag</option>
                    {CREATOR_DISCOVERY_NICHES.map((n) => (
                      <option key={n.key} value={n.key}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn-primary" onClick={runContactsDiscovery} disabled={findingContacts || !contactsDomain.trim()}>
                  {findingContacts ? 'Searching…' : 'Find contacts'}
                </button>
              </div>
            </>
          ) : discoverMode === 'youtube' ? (
            <>
              <p className="text-sm text-gray-500">
                Searches YouTube directly (not Ahrefs) for real channels matching the niche below — a free, separate source from
                the &quot;YouTube videos&quot; option under Keyword search, which finds individual videos ranking in Google search
                rather than channels.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label">Niche</label>
                  <select className="input min-w-[22rem]" value={youtubeNiche} onChange={(e) => setYoutubeNiche(e.target.value)}>
                    {CREATOR_DISCOVERY_NICHES.map((n) => (
                      <option key={n.key} value={n.key}>
                        {n.label} — target {n.targetCount} ({n.affiliateFitNote})
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn-primary" onClick={runYoutubeDiscovery} disabled={findingYoutube}>
                  {findingYoutube ? 'Searching…' : 'Find channels'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                For creators you found by browsing Heepsy, Google Ads → Tools → YouTube Creator Partnerships, or anywhere else with
                no public API. Both options below go through the same duplicate/blocklist check as every other source.
              </p>
              <div className="flex gap-2">
                <button
                  className={importMethod === 'paste' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setImportMethod('paste')}
                >
                  Paste list
                </button>
                <button
                  className={importMethod === 'csv' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setImportMethod('csv')}
                >
                  Upload CSV (Heepsy export)
                </button>
              </div>

              {importMethod === 'paste' ? (
                <>
                  <p className="text-xs text-gray-400">
                    One prospect per line as <code className="rounded bg-gray-100 px-1">Name, link</code> — paste as many lines at
                    once as you want.
                  </p>
                  <textarea
                    className="input min-h-[8rem] w-full font-mono text-xs"
                    placeholder={'Jane Smith, https://youtube.com/@janesmith\nJohn Doe Realty Blog, https://johndoerealty.com'}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                  />
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-400">
                    Export your Heepsy search results as CSV, then choose the file below. Name/link/email/follower columns are
                    detected automatically — exact column names can vary by export.
                  </p>
                  <div className="flex items-center gap-3">
                    <label className="btn-secondary cursor-pointer">
                      Choose CSV file
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(e) => handleCsvFileSelect(e.target.files?.[0])}
                      />
                    </label>
                    {importCsvFileName && <span className="text-sm text-gray-600">{importCsvFileName}</span>}
                  </div>
                </>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label">Where did you find these?</label>
                  <select className="input min-w-[16rem]" value={importSourceLabel} onChange={(e) => setImportSourceLabel(e.target.value)}>
                    <option value="Heepsy">Heepsy</option>
                    <option value="Google Ads YouTube Creator Partnerships">Google Ads → YouTube Creator Partnerships</option>
                    <option value="Other manual research">Other manual research</option>
                  </select>
                </div>
                <div>
                  <label className="label">Tag with niche (optional)</label>
                  <select className="input min-w-[18rem]" value={importNiche} onChange={(e) => setImportNiche(e.target.value)}>
                    <option value="">No niche tag</option>
                    {CREATOR_DISCOVERY_NICHES.map((n) => (
                      <option key={n.key} value={n.key}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn-primary"
                  onClick={runImport}
                  disabled={importing || (importMethod === 'csv' ? !importCsvText.trim() : !importText.trim())}
                >
                  {importing ? 'Adding…' : 'Add prospects'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Other places to look</h2>
        <p className="text-sm text-gray-500">
          No public API for any of these, so they need a person browsing manually — once you have results, paste them into the
          &quot;Add from research&quot; tab above and they&apos;ll flow into the same pipeline as everything else.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-500">
          <li>
            <strong className="text-gray-700">Heepsy</strong> — you have an account for this one. Search real estate creators, then
            export the results as CSV and use the &quot;Upload CSV&quot; option in &quot;Add from research&quot; — no retyping
            needed.
          </li>
          <li>
            <strong className="text-gray-700">Google Ads → Tools → YouTube Creator Partnerships</strong> — log into the shared
            Google Ads account to browse YouTube creators by niche and audience, then paste results in the same way.
          </li>
          <li>
            <strong className="text-gray-700">Other paywalled creator/influencer databases</strong> — Favikon, Collabstr,
            Ainfluencer, GRIN, CreatorIQ, Traackr, and Modash all let you filter by niche/follower count; none have a public API,
            but Modash and Influencers.Club also publish free browsable &quot;top real estate creators&quot; lists with no login
            required.
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

      {selectedIds.size > 0 && (
        <div className="card flex flex-wrap items-center gap-3 border-grove-dark bg-grove-light/40 py-3">
          <span className="text-sm font-medium text-gray-800">{selectedIds.size} selected</span>
          <button className="btn-primary" onClick={() => bulkSetStage('approved')} disabled={bulkWorking}>
            Approve → Outreach
          </button>
          <button className="btn-secondary" onClick={() => bulkSetStage('pass')} disabled={bulkWorking}>
            Pass
          </button>
          <button className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50" onClick={bulkDelete} disabled={bulkWorking}>
            Delete
          </button>
          <button className="text-sm text-gray-500 hover:underline" onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        {loading && <p className="p-4 text-sm text-gray-400">Loading…</p>}
        {!loading && prospects.length === 0 && <p className="p-4 text-sm text-gray-400">No prospects match these filters.</p>}
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="w-8 px-4 py-2">
                <input
                  type="checkbox"
                  checked={prospects.length > 0 && prospects.every((p) => selectedIds.has(p.id))}
                  onChange={() => toggleSelectAllVisible(prospects.map((p) => p.id), prospects.length > 0 && prospects.every((p) => selectedIds.has(p.id)))}
                />
              </th>
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
              <tr key={p.id} className={selectedIds.has(p.id) ? 'bg-grove-light/30' : 'hover:bg-gray-50'}>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelected(p.id)} />
                </td>
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

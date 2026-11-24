'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import useSWRLike from '@/lib/useSWRLike';
import type { Prospect, ProspectStage } from '@/types';
import { OUTREACH_STAGES, PROSPECT_STAGES } from '@/types';
import ScoreBadge from '@/components/ScoreBadge';
import StageBadge from '@/components/StageBadge';
import OutreachComposer from '@/components/OutreachComposer';
import EmailExamples from '@/components/EmailExamples';

interface DraftSummary {
  prospect_id: string;
  subject: string;
  source: string | null;
  outlook_saved_at: string | null;
}

interface OutlookStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

// Why a prospect can't get a first email generated, or null when they can.
function ineligibleReason(p: Prospect): string | null {
  if (p.disqualified) return 'Disqualified';
  if (p.unsubscribed) return 'Unsubscribed';
  if (!p.email) return 'No email yet';
  if (p.stage !== 'approved') return 'Already contacted';
  return null;
}

// Runs `fn` over `items` with at most `limit` in flight at once.
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        await fn(item);
      }
    })
  );
}

export default function OutreachPage() {
  const { data, loading, refresh } = useSWRLike<{ prospects: Prospect[] }>('/api/prospects');
  const { data: draftData, refresh: refreshDrafts } = useSWRLike<{ drafts: DraftSummary[] }>('/api/outreach/drafts');
  const { data: outlook } = useSWRLike<OutlookStatus>('/api/auth/microsoft/status');
  const [stageFilter, setStageFilter] = useState<ProspectStage | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [failures, setFailures] = useState<{ name: string; error: string }[]>([]);

  const drafts = useMemo(() => new Map((draftData?.drafts ?? []).map((d) => [d.prospect_id, d])), [draftData]);

  const prospects = useMemo(() => {
    let list = (data?.prospects ?? []).filter((p) => OUTREACH_STAGES.includes(p.stage));
    if (stageFilter !== 'all') list = list.filter((p) => p.stage === stageFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [data, stageFilter, search]);

  const eligible = prospects.filter((p) => !ineligibleReason(p));
  const selectedList = prospects.filter((p) => selected.has(p.id));
  const selectedEligible = selectedList.filter((p) => !ineligibleReason(p));
  const selectedWithDraft = selectedList.filter((p) => drafts.has(p.id));
  const allSelected = eligible.length > 0 && eligible.every((p) => selected.has(p.id));
  const busy = progress !== null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(eligible.map((p) => p.id)));
  }

  async function generateSelected() {
    const targets = selectedEligible;
    if (targets.length === 0) return;
    const replacing = targets.filter((p) => drafts.has(p.id)).length;
    if (replacing > 0 && !confirm(`${replacing} of these already have a draft. Generating again replaces it (including any edits). Continue?`)) return;

    setFailures([]);
    const failed: { name: string; error: string }[] = [];
    let done = 0;
    setProgress(`Generating 0 of ${targets.length}…`);
    await pool(targets, 3, async (p) => {
      try {
        const res = await fetch('/api/outreach/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prospectId: p.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
      } catch (err) {
        failed.push({ name: p.name, error: err instanceof Error ? err.message : 'Failed' });
      }
      done++;
      setProgress(`Generating ${done} of ${targets.length}…`);
    });
    setProgress(null);
    setFailures(failed);
    refreshDrafts();
    const ok = targets.length - failed.length;
    if (ok > 0) toast.success(`Generated ${ok} email${ok === 1 ? '' : 's'}. Open a row to review or edit.`);
    if (failed.length > 0) toast.error(`${failed.length} could not be generated. See the list below.`);
    if (ok > 0 && targets.length === 1 && failed.length === 0) setExpanded(targets[0].id);
  }

  async function saveSelectedToOutlook() {
    const targets = selectedWithDraft.filter((p) => !ineligibleReason(p));
    if (targets.length === 0) {
      toast.error('Generate emails for the selected people first.');
      return;
    }
    setFailures([]);
    const failed: { name: string; error: string }[] = [];
    let done = 0;
    let stop = false;
    setProgress(`Saving 0 of ${targets.length} to Outlook…`);
    // One at a time: gentler on Microsoft's rate limits.
    await pool(targets, 1, async (p) => {
      if (stop) return;
      try {
        const res = await fetch('/api/outreach/outlook-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prospectId: p.id }),
        });
        const json = await res.json();
        if (!res.ok) {
          if (json.reconnect) stop = true;
          throw new Error(json.error);
        }
      } catch (err) {
        failed.push({ name: p.name, error: err instanceof Error ? err.message : 'Failed' });
      }
      done++;
      setProgress(`Saving ${done} of ${targets.length} to Outlook…`);
    });
    setProgress(null);
    setFailures(failed);
    refreshDrafts();
    const ok = done - failed.length;
    if (ok > 0) toast.success(`Saved ${ok} draft${ok === 1 ? '' : 's'} to ${outlook?.email ?? 'your Outlook'}. Review and send them from Outlook.`);
    if (failed.length > 0) toast.error(`${failed.length} could not be saved. See the list below.`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Outreach</h1>
        <p className="text-sm text-gray-500">
          Check the people you want to email, generate their first email, review it, then save it to your Outlook Drafts (or copy it) and send it yourself.
        </p>
      </div>

      <EmailExamples />

      <div className="flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Search by name or category…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-xs" value={stageFilter} onChange={(e) => setStageFilter(e.target.value as typeof stageFilter)}>
          <option value="all">All stages</option>
          {PROSPECT_STAGES.filter((s) => OUTREACH_STAGES.includes(s.key)).map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          className="btn-secondary"
          onClick={() => {
            refresh();
            refreshDrafts();
          }}
        >
          Refresh
        </button>
      </div>

      {selected.size > 0 && (
        <div className="card flex flex-wrap items-center gap-3 py-3 text-sm">
          <span className="font-medium text-gray-800">{selected.size} selected</span>
          <button className="btn-primary" onClick={generateSelected} disabled={busy || selectedEligible.length === 0}>
            Generate initial emails ({selectedEligible.length})
          </button>
          {outlook?.configured &&
            (outlook.connected ? (
              <button className="btn-secondary" onClick={saveSelectedToOutlook} disabled={busy || selectedWithDraft.length === 0}>
                Save to Outlook drafts ({selectedWithDraft.length})
              </button>
            ) : (
              <a className="btn-secondary" href="/api/auth/microsoft?return=/outreach">
                Connect Outlook to save drafts
              </a>
            ))}
          <button className="text-xs text-gray-500 hover:underline" onClick={() => setSelected(new Set())} disabled={busy}>
            Clear
          </button>
          {progress && <span className="text-gray-500">{progress}</span>}
          {selectedList.length > selectedEligible.length && (
            <span className="text-xs text-gray-400">{selectedList.length - selectedEligible.length} selected can&apos;t get a first email (see the Draft column).</span>
          )}
        </div>
      )}

      {failures.length > 0 && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <div className="mb-1 font-medium">Could not finish for:</div>
          <ul className="list-disc space-y-0.5 pl-5">
            {failures.map((f) => (
              <li key={f.name}>
                <span className="font-medium">{f.name}</span>: {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        {loading && <p className="p-4 text-sm text-gray-400">Loading…</p>}
        {!loading && prospects.length === 0 && (
          <p className="p-4 text-sm text-gray-400">
            Nothing here yet. Approve a prospect from{' '}
            <Link href="/search" className="underline">
              Prospect Search
            </Link>{' '}
            to move it into outreach.
          </p>
        )}
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="w-10 px-4 py-2">
                <input type="checkbox" aria-label="Select everyone who can get a first email" checked={allSelected} onChange={toggleAll} disabled={eligible.length === 0 || busy} />
              </th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Draft</th>
              <th className="px-4 py-2">Score</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2">Last contacted</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {prospects.map((p) => {
              const reason = ineligibleReason(p);
              const draft = drafts.get(p.id);
              const open = expanded === p.id;
              return (
                <Fragment key={p.id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.name}`}
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                        disabled={busy}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/prospects/${p.id}`} className="font-medium text-grove-dark hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-xs capitalize text-gray-400">{p.prospect_type}</div>
                    </td>
                    <td className="px-4 py-3">
                      {p.email ? <span className="text-gray-600">{p.email}</span> : <span className="text-xs text-red-500">No email. Open to reveal.</span>}
                    </td>
                    <td className="px-4 py-3">
                      {draft ? (
                        <button className="text-left text-xs text-grove-dark hover:underline" onClick={() => setExpanded(open ? null : p.id)}>
                          {open ? 'Hide draft' : 'Review draft'}
                          {draft.outlook_saved_at ? ' · in Outlook' : ''}
                        </button>
                      ) : reason ? (
                        <span className="text-xs text-gray-400">{reason}</span>
                      ) : (
                        <span className="text-xs text-gray-400">Not generated</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBadge score={p.score} tier={p.score_breakdown && 'tier' in p.score_breakdown ? (p.score_breakdown as { tier: string }).tier : null} />
                    </td>
                    <td className="px-4 py-3">
                      <StageBadge stage={p.stage} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(p.last_contacted_at)}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={7} className="bg-gray-50 p-4">
                        <OutreachComposer
                          prospect={p}
                          onSent={() => {
                            refresh();
                            refreshDrafts();
                            setExpanded(null);
                          }}
                          onEnriched={() => refresh()}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

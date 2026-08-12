'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import useSWRLike from '@/lib/useSWRLike';
import { DEFAULT_COMPETITOR_BLOCKLIST } from '@/lib/rei-grove-content';

interface SettingsResponse {
  settings: { competitor_blocklist: { name: string; reason: string }[]; scoring_weights: Record<string, unknown> };
  mailbox: { email: string; last_synced_at: string | null; created_at: string } | null;
  ahrefsEnabled: boolean;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-400">Loading…</p>}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const { data, loading, refresh } = useSWRLike<SettingsResponse>('/api/settings');
  const searchParams = useSearchParams();
  const [syncing, setSyncing] = useState(false);
  const [runningFollowUps, setRunningFollowUps] = useState(false);
  const [blocklistText, setBlocklistText] = useState('');
  const [savingBlocklist, setSavingBlocklist] = useState(false);
  const [appUrl, setAppUrl] = useState('');

  useEffect(() => {
    setAppUrl(window.location.origin);
  }, []);

  useEffect(() => {
    if (data?.settings.competitor_blocklist) {
      setBlocklistText(data.settings.competitor_blocklist.map((b) => `${b.name} | ${b.reason}`).join('\n'));
    }
  }, [data]);

  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected) toast.success('Outlook connected.');
    if (error) toast.error(`Outlook connection failed: ${error}`);
  }, [searchParams]);

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await fetch('/api/internal/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (json.errors?.length) {
        toast.error(json.errors[0]);
      } else {
        toast.success(`Synced — ${json.newMessages} new message(s) across ${json.matchedProspects} prospect(s).`);
      }
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function runFollowUpsNow() {
    setRunningFollowUps(true);
    try {
      const res = await fetch('/api/internal/follow-ups/run', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (json.errors?.length) {
        toast.error(json.errors[0]);
      } else {
        toast.success(`Checked ${json.checked} prospect(s) — sent ${json.sent} follow-up(s)${json.stalled ? `, ${json.stalled} sequence(s) now complete` : ''}.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Follow-up run failed');
    } finally {
      setRunningFollowUps(false);
    }
  }

  async function saveBlocklist() {
    setSavingBlocklist(true);
    try {
      const list = blocklistText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, reason] = line.split('|').map((s) => s.trim());
          return { name, reason: reason ?? 'Manually added' };
        });
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitor_blocklist: list }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('Blocklist saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingBlocklist(false);
    }
  }

  if (loading || !data) return <p className="text-sm text-gray-400">Loading…</p>;

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>

      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-900">Outlook / M365 mailbox</h2>
        {data.mailbox ? (
          <>
            <p className="text-sm text-gray-700">
              Connected: <span className="font-medium">{data.mailbox.email}</span>
            </p>
            <p className="text-xs text-gray-400">
              Last synced: {data.mailbox.last_synced_at ? new Date(data.mailbox.last_synced_at).toLocaleString() : 'never'}
            </p>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={syncNow} disabled={syncing}>
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
              <a href="/api/auth/microsoft" className="btn-secondary">
                Reconnect / switch mailbox
              </a>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500">No mailbox connected yet. Connect the Outlook inbox outreach should send from and monitor for replies.</p>
            <a href="/api/auth/microsoft" className="btn-primary inline-block">
              Connect Outlook
            </a>
          </>
        )}
        <p className="text-xs text-gray-400">
          Requires an Azure AD app registration with delegated Mail.Send, Mail.Read, Mail.ReadWrite, User.Read, offline_access — see DEPLOY.md.
        </p>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-900">n8n integration</h2>
        <p className="text-sm text-gray-500">
          Point n8n workflows at these endpoints. Every request must include header <code className="rounded bg-gray-100 px-1">x-n8n-secret</code> matching
          your <code className="rounded bg-gray-100 px-1">N8N_WEBHOOK_SECRET</code> env var.
        </p>
        <div className="space-y-1 text-sm">
          <div>
            <span className="label mb-0 inline">Ingest discovered prospects (POST):</span>{' '}
            <code className="rounded bg-gray-100 px-1">{appUrl}/api/webhooks/n8n/prospects</code>
          </div>
          <div>
            <span className="label mb-0 inline">Trigger mailbox sync (POST, run on a schedule):</span>{' '}
            <code className="rounded bg-gray-100 px-1">{appUrl}/api/graph/sync</code>
          </div>
          <div>
            <span className="label mb-0 inline">Run follow-up sequence (POST, once a day is plenty):</span>{' '}
            <code className="rounded bg-gray-100 px-1">{appUrl}/api/outreach/follow-ups/run</code>
          </div>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-900">Follow-up sequence</h2>
        <p className="text-sm text-gray-500">
          Once a prospect is approved and the first email goes out, this runs on its own: a follow-up 7 days later if there&apos;s no
          reply, another 7 days after that, and a final one 30 days after that (about 6 weeks after the first email). Any reply or
          unsubscribe stops it immediately. Point the n8n endpoint above at a daily schedule to keep it running automatically, or
          trigger a check right now:
        </p>
        <button className="btn-secondary" onClick={runFollowUpsNow} disabled={runningFollowUps}>
          {runningFollowUps ? 'Running…' : 'Run follow-ups now'}
        </button>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-900">Ahrefs</h2>
        <p className="text-sm">
          Status:{' '}
          {data.ahrefsEnabled ? (
            <span className="text-green-700">Connected (AHREFS_API_KEY set)</span>
          ) : (
            <span className="text-gray-500">Not configured — optional, scoring works fine without it.</span>
          )}
        </p>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-900">Competitor blocklist (auto-disqualify)</h2>
        <p className="text-sm text-gray-500">
          One per line, format <code className="rounded bg-gray-100 px-1">Name | Reason</code>. These are checked in addition to the built-in defaults
          ({DEFAULT_COMPETITOR_BLOCKLIST.map((b) => b.name).join(', ')}), which are always enforced and can't be removed here.
        </p>
        <textarea className="input" rows={5} value={blocklistText} onChange={(e) => setBlocklistText(e.target.value)} />
        <button className="btn-primary" onClick={saveBlocklist} disabled={savingBlocklist}>
          {savingBlocklist ? 'Saving…' : 'Save blocklist'}
        </button>
      </div>
    </div>
  );
}

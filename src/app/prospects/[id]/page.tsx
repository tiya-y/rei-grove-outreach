'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import useSWRLike from '@/lib/useSWRLike';
import type { Prospect, Message } from '@/types';
import { PROSPECT_STAGES, isOutreachStage } from '@/types';
import StageBadge from '@/components/StageBadge';
import ScoreBadge from '@/components/ScoreBadge';
import ScoringPanel from '@/components/ScoringPanel';
import SentLog from '@/components/SentLog';
import OutreachComposer from '@/components/OutreachComposer';

interface DetailResponse {
  prospect: Prospect;
  messages: Message[];
  activity: { id: string; event_type: string; detail: string; created_at: string }[];
}

export default function ProspectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, refresh } = useSWRLike<DetailResponse>(`/api/prospects/${params.id}`);
  const [ahrefsLoading, setAhrefsLoading] = useState(false);

  if (loading || !data) return <p className="text-sm text-gray-400">Loading…</p>;

  const { prospect, messages, activity } = data;

  async function updateProspect(update: Partial<Prospect>) {
    const res = await fetch(`/api/prospects/${prospect.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? 'Update failed');
      return;
    }
    toast.success('Saved');
    refresh();
  }

  async function pullAhrefs() {
    setAhrefsLoading(true);
    try {
      const res = await fetch('/api/ahrefs/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: prospect.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('Ahrefs metrics pulled');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ahrefs lookup failed');
    } finally {
      setAhrefsLoading(false);
    }
  }

  async function deleteProspect() {
    if (!confirm(`Delete ${prospect.name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/prospects/${prospect.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Deleted');
      router.push('/search');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{prospect.name}</h1>
          <p className="text-sm text-gray-500 capitalize">
            {prospect.prospect_type} {prospect.category ? `· ${prospect.category.replace(/_/g, ' ')}` : ''} {prospect.website ? `· ${prospect.website}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScoreBadge score={prospect.score} tier={prospect.score_breakdown && 'tier' in prospect.score_breakdown ? (prospect.score_breakdown as { tier: string }).tier : null} />
          <StageBadge stage={prospect.stage} />
        </div>
      </div>

      {prospect.disqualified && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <span>Auto-disqualified: {prospect.disqualify_reason}</span>
          <button className="btn-secondary" onClick={() => updateProspect({ disqualified: false, disqualify_reason: null })}>
            Override (mark qualified anyway)
          </button>
        </div>
      )}

      {prospect.unsubscribed && (
        <div className="flex items-center justify-between rounded-lg bg-orange-50 p-4 text-sm text-orange-700">
          <span>
            Unsubscribed{prospect.unsubscribed_at ? ` on ${new Date(prospect.unsubscribed_at).toLocaleDateString()}` : ''} — generating
            or recording outreach is blocked.
          </span>
          <button className="btn-secondary" onClick={() => updateProspect({ unsubscribed: false, unsubscribed_at: null })}>
            Resubscribe
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-900">Details</h2>
          <div className="text-sm">
            <div className="label">Contact</div>
            <div>{[prospect.contact_first_name, prospect.contact_last_name].filter(Boolean).join(' ') || '—'}</div>
          </div>
          <div className="text-sm">
            <div className="label">Email</div>
            <div>{prospect.email ?? '—'}</div>
          </div>
          <div className="text-sm">
            <div className="label">Location</div>
            <div>{[prospect.city, prospect.state].filter(Boolean).join(', ') || '—'}</div>
          </div>
          <div className="text-sm">
            <div className="label">Audience size est.</div>
            <div>{prospect.audience_size_est ?? '—'}</div>
          </div>
          <div className="text-sm">
            <div className="label">Ahrefs Domain Rating</div>
            <div className="flex items-center gap-2">
              {prospect.domain_rating ?? '—'}
              <button className="text-xs text-grove-dark hover:underline" onClick={pullAhrefs} disabled={ahrefsLoading || !prospect.website}>
                {ahrefsLoading ? 'Pulling…' : 'Pull from Ahrefs'}
              </button>
            </div>
          </div>
          <div className="text-sm">
            <div className="label">Content presence notes</div>
            <div className="whitespace-pre-wrap">{prospect.content_presence ?? '—'}</div>
          </div>
          <div className="text-sm">
            <div className="label">Source</div>
            <div>
              {prospect.source} {prospect.source_ref ? `(${prospect.source_ref})` : ''}
            </div>
          </div>

          <div>
            <label className="label">Stage</label>
            <select className="input" value={prospect.stage} onChange={(e) => updateProspect({ stage: e.target.value as Prospect['stage'] })}>
              {PROSPECT_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <button className="text-xs text-red-500 hover:underline" onClick={deleteProspect}>
            Delete prospect
          </button>
        </div>

        <div className="col-span-2 space-y-6">
          {isOutreachStage(prospect.stage) ? (
            <OutreachComposer prospect={prospect} onSent={() => refresh()} />
          ) : (
            <>
              <ScoringPanel prospect={prospect} onScored={() => refresh()} />
              <div className="card space-y-2">
                <h2 className="font-semibold text-gray-900">Approve for outreach</h2>
                <p className="text-sm text-gray-500">
                  Once this prospect is scored and qualified, approve it to move it into the Outreach pipeline where you can draft and send.
                </p>
                {(prospect.disqualified || !prospect.email) && (
                  <p className="text-xs text-red-600">
                    {prospect.disqualified ? `Blocked — disqualified (${prospect.disqualify_reason}).` : 'Blocked — no email address on file.'}
                  </p>
                )}
                <button
                  className="btn-primary"
                  disabled={prospect.disqualified || !prospect.email}
                  onClick={() => updateProspect({ stage: 'approved' })}
                >
                  Approve for outreach
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold text-gray-900">Sent log</h2>
        <SentLog messages={messages} />
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold text-gray-900">Activity log</h2>
        <div className="space-y-2 text-sm text-gray-600">
          {activity.length === 0 && <p className="text-gray-400">No activity yet.</p>}
          {activity.map((a) => (
            <div key={a.id} className="flex justify-between border-b pb-1 last:border-0">
              <span>
                <span className="font-medium text-gray-800">{a.event_type.replace(/_/g, ' ')}</span> — {a.detail}
              </span>
              <span className="text-xs text-gray-400">{new Date(a.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

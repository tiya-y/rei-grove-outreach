'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useSWRLike from '@/lib/useSWRLike';
import { ACTIVATION_CHANNELS } from '@/lib/rei-grove-content';
import type { Prospect } from '@/types';
import { isFullyQualified } from '@/types';

interface OutlookStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
}

export default function OutreachComposer({ prospect, onSent, onEnriched }: { prospect: Prospect; onSent: () => void; onEnriched?: () => void }) {
  const offerTypeDefault = prospect.prospect_type === 'partner' ? 'webinar' : 'affiliate_terms';
  const [offerType, setOfferType] = useState(offerTypeDefault);
  const [sequenceStep, setSequenceStep] = useState(1);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [marking, setMarking] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedDraft, setSavedDraft] = useState<{ webLink: string | null; mailbox: string } | null>(null);
  const [draftSource, setDraftSource] = useState<string | null>(null);
  const [outlookSavedAt, setOutlookSavedAt] = useState<string | null>(null);
  const { data: outlook, refresh: refreshOutlook } = useSWRLike<OutlookStatus>('/api/auth/microsoft/status');

  // Pick up a draft that was already generated (for example from the Outreach tab).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/prospects/${prospect.id}/draft`)
      .then((r) => r.json())
      .then((json) => {
        const d = json.draft;
        if (cancelled || !d) return;
        setSubject(d.subject);
        setBody(d.body);
        setOfferType(d.offer_type ?? offerTypeDefault);
        setSequenceStep(d.sequence_step ?? 1);
        setAiGenerated(Boolean(d.ai_generated));
        setDraftSource(d.source ?? null);
        setOutlookSavedAt(d.outlook_saved_at ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospect.id]);

  // Keep edits so they survive leaving the page.
  async function persistEdits() {
    if (!subject.trim() || !body.trim()) return;
    try {
      await fetch(`/api/prospects/${prospect.id}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body, offerType, sequenceStep, aiGenerated }),
      });
    } catch {
      // Not critical: the text is still on screen.
    }
  }

  const placeholders = Array.from(new Set(body.match(/\[[^\]\n]{2,40}\]/g) ?? []));

  const missingEmail = !prospect.disqualified && !prospect.unsubscribed && !prospect.email;
  const canReveal = missingEmail && isFullyQualified(prospect);
  const blocked = prospect.disqualified || prospect.unsubscribed || !prospect.email;

  async function findEmail() {
    setEnriching(true);
    try {
      const res = await fetch(`/api/prospects/${prospect.id}/enrich`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (json.prospect?.email) toast.success(`Found: ${json.prospect.email}`);
      else toast(`No match found (confidence: ${json.match?.matchConfidence ?? 'none'}).`);
      onEnriched?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Apollo lookup failed');
    } finally {
      setEnriching(false);
    }
  }

  async function draft() {
    setDrafting(true);
    try {
      const res = await fetch('/api/outreach/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: prospect.id, offerType, sequenceStep, save: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSubject(json.draft.subject);
      setBody(json.draft.body);
      setAiGenerated(Boolean(json.draft.aiGenerated));
      setDraftSource(json.draft.source ?? null);
      setOutlookSavedAt(null);
      toast.success('Draft generated. Review it before sending.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Draft generation failed');
    } finally {
      setDrafting(false);
    }
  }

  async function copyToClipboard() {
    if (!subject || !body) {
      toast.error('Generate or write a subject + body first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      toast.success('Copied — paste it into your own email and send.');
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  }

  async function saveToOutlook() {
    if (!subject || !body) {
      toast.error('Generate or write a subject + body first.');
      return;
    }
    setSavingDraft(true);
    try {
      const res = await fetch('/api/outreach/outlook-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: prospect.id, subject, body, offerType, sequenceStep, aiGenerated }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.reconnect) refreshOutlook();
        throw new Error(json.error);
      }
      setSavedDraft({ webLink: json.draft.webLink, mailbox: json.mailbox });
      setOutlookSavedAt(new Date().toISOString());
      toast.success(`Saved to ${json.mailbox} Drafts. Review and send it from Outlook.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the draft');
    } finally {
      setSavingDraft(false);
    }
  }

  async function markSent() {
    if (!subject || !body) {
      toast.error('Generate or write a subject + body first.');
      return;
    }
    setMarking(true);
    try {
      const res = await fetch('/api/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: prospect.id, subject, body, offerType, sequenceStep, aiGenerated }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('Marked as sent.');
      setSubject('');
      setBody('');
      setAiGenerated(false);
      setSavedDraft(null);
      setDraftSource(null);
      setOutlookSavedAt(null);
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record send');
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold text-gray-900">Compose outreach</h2>
      <p className="text-sm text-gray-500">
        Generate the draft, then save it to your Outlook Drafts (or copy it) and send it from your own inbox. The app never sends
        email itself. Once it&apos;s sent, mark it here so the pipeline stays up to date.
      </p>

      {blocked && (
        <div className="flex items-center justify-between gap-3 rounded bg-red-50 p-3 text-sm text-red-700">
          <span>
            {prospect.disqualified
              ? `This prospect is disqualified (${prospect.disqualify_reason}) — drafting is blocked.`
              : prospect.unsubscribed
                ? 'This prospect has unsubscribed — drafting is blocked.'
                : canReveal
                  ? 'This prospect passed all three rounds but has no email yet. Reveal it with Apollo.'
                  : 'This prospect has no email and has not passed all three qualification rounds. Run the rounds above first, then reveal the email.'}
          </span>
          {canReveal && (
            <button className="btn-secondary shrink-0" onClick={findEmail} disabled={enriching}>
              {enriching ? 'Looking…' : 'Reveal email (Apollo)'}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Offer / activation channel</label>
          <select className="input" value={offerType} onChange={(e) => setOfferType(e.target.value)}>
            {ACTIVATION_CHANNELS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Sequence step</label>
          <select className="input" value={sequenceStep} onChange={(e) => setSequenceStep(Number(e.target.value))}>
            <option value={1}>1 — Initial outreach</option>
            <option value={2}>2 — Follow-up</option>
            <option value={3}>3 — Follow-up</option>
            <option value={4}>4 — Final follow-up</option>
          </select>
        </div>
      </div>

      <button className="btn-secondary" onClick={draft} disabled={drafting || blocked}>
        {drafting ? 'Drafting…' : 'Generate draft'}
      </button>

      {draftSource && (
        <p className="text-xs text-gray-500">
          {draftSource === 'examples'
            ? 'Written from your example emails. The offer terms and links are fixed and checked.'
            : draftSource === 'template'
              ? 'Built from the fixed affiliate template (no example emails uploaded yet).'
              : 'Written by Claude.'}
          {outlookSavedAt ? ' Saved to your Outlook Drafts.' : ''}
        </p>
      )}
      <div>
        <label className="label">Subject</label>
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} onBlur={persistEdits} />
      </div>
      <div>
        <label className="label">Body</label>
        <textarea className="input" rows={10} value={body} onChange={(e) => setBody(e.target.value)} onBlur={persistEdits} />
      </div>
      {placeholders.length > 0 && (
        <div className="rounded bg-amber-50 p-3 text-xs text-amber-800">
          Fill these in before sending: {placeholders.map((ph) => (
            <code key={ph} className="mr-1 rounded bg-amber-100 px-1">
              {ph}
            </code>
          ))}
          {placeholders.includes('[Your Name]') && outlook?.connected ? ' ([Your Name] is filled in automatically when you save to Outlook.)' : ''}
        </div>
      )}

      {outlook?.configured && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {outlook.connected ? (
            <>
              <button className="btn-secondary" onClick={saveToOutlook} disabled={savingDraft || blocked}>
                {savingDraft ? 'Saving…' : 'Save to Outlook drafts'}
              </button>
              <span className="text-xs text-gray-500">Saves to {outlook.email}</span>
            </>
          ) : (
            <a className="btn-secondary" href={`/api/auth/microsoft?return=${encodeURIComponent(`/prospects/${prospect.id}`)}`}>
              Connect Outlook to save drafts
            </a>
          )}
          {savedDraft?.webLink && (
            <a href={savedDraft.webLink} target="_blank" rel="noreferrer" className="text-grove-dark hover:underline">
              Open draft in Outlook
            </a>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button className="btn-secondary" onClick={copyToClipboard} disabled={blocked}>
          Copy to clipboard
        </button>
        <button className="btn-primary" onClick={markSent} disabled={marking || blocked}>
          {marking ? 'Marking…' : 'Mark as sent'}
        </button>
      </div>
    </div>
  );
}

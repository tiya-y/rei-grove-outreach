'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ACTIVATION_CHANNELS } from '@/lib/rei-grove-content';
import type { Prospect } from '@/types';

export interface ComposerPrefill {
  subject: string;
  body: string;
}

export default function OutreachComposer({
  prospect,
  onSent,
  prefill,
}: {
  prospect: Prospect;
  onSent: () => void;
  prefill?: ComposerPrefill | null;
}) {
  const [offerType, setOfferType] = useState(prospect.prospect_type === 'partner' ? 'webinar' : 'affiliate_terms');
  const [sequenceStep, setSequenceStep] = useState(1);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  useEffect(() => {
    if (!prefill) return;
    setSubject(prefill.subject);
    setBody(prefill.body);
    setAiGenerated(true);
  }, [prefill]);

  const blocked = prospect.disqualified || prospect.unsubscribed || !prospect.email;

  async function draft() {
    setDrafting(true);
    try {
      const res = await fetch('/api/outreach/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: prospect.id, offerType, sequenceStep }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSubject(json.draft.subject);
      setBody(json.draft.body);
      setAiGenerated(true);
      toast.success('Draft generated — review before sending.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Draft generation failed');
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    if (!subject || !body) {
      toast.error('Generate or write a subject + body first.');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: prospect.id, subject, body, offerType, sequenceStep, aiGenerated }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('Sent via Outlook.');
      setSubject('');
      setBody('');
      setAiGenerated(false);
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold text-gray-900">Compose outreach</h2>

      {blocked && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700">
          {prospect.disqualified
            ? `This prospect is disqualified (${prospect.disqualify_reason}) — sending is blocked.`
            : prospect.unsubscribed
              ? 'This prospect has unsubscribed — sending is blocked.'
              : 'This prospect has no email address on file — add one before sending.'}
        </p>
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
          </select>
        </div>
      </div>

      <button className="btn-secondary" onClick={draft} disabled={drafting || blocked}>
        {drafting ? 'Drafting…' : 'Generate draft with Claude'}
      </button>

      <div>
        <label className="label">Subject</label>
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div>
        <label className="label">Body</label>
        <textarea className="input" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>

      <button className="btn-primary" onClick={send} disabled={sending || blocked}>
        {sending ? 'Sending…' : 'Send via connected Outlook inbox'}
      </button>
    </div>
  );
}

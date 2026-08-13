'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { ACTIVATION_CHANNELS } from '@/lib/rei-grove-content';
import type { Prospect } from '@/types';

export default function OutreachComposer({ prospect, onSent }: { prospect: Prospect; onSent: () => void }) {
  const [offerType, setOfferType] = useState(prospect.prospect_type === 'partner' ? 'webinar' : 'affiliate_terms');
  const [sequenceStep, setSequenceStep] = useState(1);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [marking, setMarking] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

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
      toast.success('Draft generated — review before copying.');
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
        Generate the draft, copy it, and send it from your own inbox. Once it&apos;s sent, mark it here so the pipeline stays up to
        date.
      </p>

      {blocked && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700">
          {prospect.disqualified
            ? `This prospect is disqualified (${prospect.disqualify_reason}) — drafting is blocked.`
            : prospect.unsubscribed
              ? 'This prospect has unsubscribed — drafting is blocked.'
              : 'This prospect has no email address on file — add one first.'}
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
            <option value={4}>4 — Final follow-up</option>
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

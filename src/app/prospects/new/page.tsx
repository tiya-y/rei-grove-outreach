'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

const CATEGORY_OPTIONS: Record<string, string[]> = {
  partner: ['proptech', 're_services', 'education_media', 'adjacent_tech', 'other'],
  creator: ['youtube', 'blog', 'podcast', 'newsletter', 'webinar', 'community', 'other'],
  affiliate: ['youtube', 'blog', 'podcast', 'newsletter', 'other'],
};

export default function NewProspectPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    prospect_type: 'partner',
    name: '',
    contact_first_name: '',
    contact_last_name: '',
    email: '',
    website: '',
    category: '',
    city: '',
    state: '',
    audience_size_est: '',
    content_presence: '',
    notes: '',
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          audience_size_est: form.audience_size_est ? Number(form.audience_size_est) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to create prospect');
      if (json.disqualifier?.disqualified) {
        toast.error(`Added, but auto-disqualified: ${json.disqualifier.reason}`);
      } else {
        toast.success('Prospect added');
      }
      router.push(`/prospects/${json.prospect.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Add a prospect</h1>
      <p className="text-sm text-gray-500">
        Manual entry. To add prospects in bulk from a discovery workflow, point n8n at{' '}
        <code className="rounded bg-gray-100 px-1">/api/webhooks/n8n/prospects</code> instead (see Settings).
      </p>

      <form onSubmit={onSubmit} className="card space-y-4">
        <div>
          <label className="label">Prospect type</label>
          <select className="input" value={form.prospect_type} onChange={(e) => update('prospect_type', e.target.value)}>
            <option value="partner">Partner (company — proptech, RE services, media)</option>
            <option value="creator">Creator (individual — blog/YouTube/podcast/newsletter)</option>
            <option value="affiliate">Affiliate (simple referral relationship)</option>
          </select>
        </div>

        <div>
          <label className="label">Name *</label>
          <input className="input" required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Company or creator/publication name" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Contact first name</label>
            <input className="input" value={form.contact_first_name} onChange={(e) => update('contact_first_name', e.target.value)} />
          </div>
          <div>
            <label className="label">Contact last name</label>
            <input className="input" value={form.contact_last_name} onChange={(e) => update('contact_last_name', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </div>
          <div>
            <label className="label">Website</label>
            <input className="input" value={form.website} onChange={(e) => update('website', e.target.value)} placeholder="example.com" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={(e) => update('category', e.target.value)}>
              <option value="">—</option>
              {(CATEGORY_OPTIONS[form.prospect_type] ?? []).map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Audience size estimate</label>
            <input className="input" type="number" value={form.audience_size_est} onChange={(e) => update('audience_size_est', e.target.value)} placeholder="subscribers / monthly visitors" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">City</label>
            <input className="input" value={form.city} onChange={(e) => update('city', e.target.value)} />
          </div>
          <div>
            <label className="label">State</label>
            <input className="input" value={form.state} onChange={(e) => update('state', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Content presence notes</label>
          <textarea className="input" rows={2} value={form.content_presence} onChange={(e) => update('content_presence', e.target.value)} placeholder="e.g. weekly landlord-focused newsletter, 8k subscribers, covers tenant screening often" />
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} />
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Add prospect'}
        </button>
      </form>
    </div>
  );
}

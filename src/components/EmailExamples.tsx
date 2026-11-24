'use client';

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import useSWRLike from '@/lib/useSWRLike';

interface Example {
  id: string;
  label: string | null;
  subject: string | null;
  body: string;
}

// Where the team's own example emails are added. New initial emails are
// written in the voice of these. With none uploaded, the fixed affiliate
// template is used instead.
export default function EmailExamples() {
  const { data, loading, refresh } = useSWRLike<{ examples: Example[] }>('/api/outreach/examples');
  const [pasted, setPasted] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const examples = data?.examples ?? [];

  async function add(text: string, name: string | null) {
    const res = await fetch('/api/outreach/examples', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, label: name }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
  }

  async function addPasted() {
    setSaving(true);
    try {
      await add(pasted, label || null);
      setPasted('');
      setLabel('');
      toast.success('Example added.');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the example');
    } finally {
      setSaving(false);
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setSaving(true);
    let added = 0;
    for (const file of Array.from(files)) {
      try {
        if (/\.(docx?|pdf|pages)$/i.test(file.name)) throw new Error('Word and PDF files cannot be read here. Copy the email text and paste it instead.');
        await add(await file.text(), file.name.replace(/\.[^.]+$/, ''));
        added++;
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : 'could not be read'}`, { duration: 8000 });
      }
    }
    if (added) toast.success(`Added ${added} example${added === 1 ? '' : 's'}.`);
    if (fileRef.current) fileRef.current.value = '';
    setSaving(false);
    refresh();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/outreach/examples?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) refresh();
    else toast.error('Could not delete that example.');
  }

  return (
    <details className="card" open={!loading && examples.length === 0}>
      <summary className="cursor-pointer font-semibold text-gray-900">
        Example emails{' '}
        <span className="text-sm font-normal text-gray-500">
          {loading ? '' : examples.length === 0 ? '(none yet, using the fixed template)' : `(${examples.length}, new emails are written in this style)`}
        </span>
      </summary>

      <div className="mt-3 space-y-4 text-sm">
        <p className="text-gray-500">
          Add emails you have sent or like. New initial emails copy their voice and structure, personalized for each person. The offer terms ($75 per
          annual signup, $5/month, 60-90 day cookie) and the REI Grove link are fixed and checked on every email, even if an example says
          something different. Upload plain text files (.txt, .md, .eml) or paste the text below.
        </p>

        {examples.length > 0 && (
          <ul className="divide-y rounded border">
            {examples.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="font-medium text-gray-800">{e.label || e.subject || 'Untitled example'}</div>
                  {e.subject && e.label && <div className="text-xs text-gray-500">Subject: {e.subject}</div>}
                  <div className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-gray-500">{e.body}</div>
                </div>
                <button className="shrink-0 text-xs text-red-500 hover:underline" onClick={() => remove(e.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <input ref={fileRef} type="file" multiple accept=".txt,.md,.eml,.text,text/plain" onChange={(e) => addFiles(e.target.files)} disabled={saving} className="text-xs" />
          <input className="input" placeholder="Name for this example (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <textarea
            className="input"
            rows={6}
            placeholder={'Or paste an email here. A first line like "Subject: ..." is used as the subject.'}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <button className="btn-secondary" onClick={addPasted} disabled={saving || !pasted.trim()}>
            {saving ? 'Adding…' : 'Add pasted example'}
          </button>
        </div>
      </div>
    </details>
  );
}

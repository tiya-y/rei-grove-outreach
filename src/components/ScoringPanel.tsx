'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getRubric, type ProspectType, type CreatorChannel } from '@/lib/scoring';
import type { Prospect, ScoreBreakdown } from '@/types';

const CREATOR_CHANNELS: CreatorChannel[] = ['youtube', 'blog', 'podcast', 'newsletter'];

export default function ScoringPanel({ prospect, onScored }: { prospect: Prospect; onScored: (p: Prospect) => void }) {
  const [channel, setChannel] = useState<CreatorChannel>((prospect.category as CreatorChannel) && CREATOR_CHANNELS.includes(prospect.category as CreatorChannel) ? (prospect.category as CreatorChannel) : 'blog');
  const [points, setPoints] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [researchNotes, setResearchNotes] = useState('');
  const [assisting, setAssisting] = useState(false);
  const [saving, setSaving] = useState(false);

  const type = prospect.prospect_type as ProspectType;
  const rubric = getRubric(type, type === 'partner' ? null : channel);

  useEffect(() => {
    const existing = prospect.score_breakdown as ScoreBreakdown | undefined;
    if (existing?.breakdown) {
      const p: Record<string, number> = {};
      const n: Record<string, string> = {};
      existing.breakdown.forEach((d) => {
        p[d.key] = d.points;
        if (d.notes) n[d.key] = d.notes;
      });
      setPoints(p);
      setNotes(n);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospect.id]);

  async function runAssist() {
    if (!researchNotes.trim()) {
      toast.error('Paste some research notes first (what you found on their site/channel).');
      return;
    }
    setAssisting(true);
    try {
      const res = await fetch(`/api/prospects/${prospect.id}/score?assist=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ researchNotes, channel }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const p: Record<string, number> = {};
      const n: Record<string, string> = {};
      json.suggestion.dimensions.forEach((d: { key: string; points: number; notes: string }) => {
        p[d.key] = d.points;
        n[d.key] = d.notes;
      });
      setPoints(p);
      setNotes(n);
      toast.success('Suggestion loaded — review before saving.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scoring assist failed');
    } finally {
      setAssisting(false);
    }
  }

  async function saveScore() {
    setSaving(true);
    try {
      const dimensions = rubric.map((d) => ({ key: d.key, points: points[d.key] ?? 0, notes: notes[d.key] }));
      const res = await fetch(`/api/prospects/${prospect.id}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions, channel }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(`Scored ${json.score.total}/100 (${json.score.tier})`);
      onScored(json.prospect);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save score');
    } finally {
      setSaving(false);
    }
  }

  const total = rubric.reduce((sum, d) => sum + (points[d.key] ?? 0), 0);

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Score this prospect</h2>
        <span className="text-sm text-gray-500">Running total: {Math.round(total)}/100</span>
      </div>

      {type !== 'partner' && (
        <div>
          <label className="label">Channel (determines which rubric applies)</label>
          <select className="input max-w-xs" value={channel} onChange={(e) => setChannel(e.target.value as CreatorChannel)}>
            {CREATOR_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="label">Research notes (optional — let Claude suggest starting points)</label>
        <textarea
          className="input"
          rows={3}
          value={researchNotes}
          onChange={(e) => setResearchNotes(e.target.value)}
          placeholder="Paste what you found: audience description, recent post/episode topics, traffic/subscriber signals, affiliate history…"
        />
        <button className="btn-secondary mt-2" onClick={runAssist} disabled={assisting}>
          {assisting ? 'Asking Claude…' : 'Ask Claude to suggest scores'}
        </button>
      </div>

      <div className="space-y-3">
        {rubric.map((dim) => (
          <div key={dim.key} className="grid grid-cols-[1fr_120px] items-start gap-3 border-t pt-3">
            <div>
              <div className="text-sm font-medium text-gray-800">
                {dim.label} <span className="text-xs text-gray-400">(max {dim.weight})</span>
              </div>
              <div className="text-xs text-gray-500">{dim.guidance}</div>
              {notes[dim.key] && <div className="mt-1 text-xs italic text-gray-400">{notes[dim.key]}</div>}
            </div>
            <input
              type="number"
              min={0}
              max={dim.weight}
              className="input"
              value={points[dim.key] ?? 0}
              onChange={(e) => setPoints((p) => ({ ...p, [dim.key]: Number(e.target.value) }))}
            />
          </div>
        ))}
      </div>

      <button className="btn-primary" onClick={saveScore} disabled={saving}>
        {saving ? 'Saving…' : 'Save score'}
      </button>
    </div>
  );
}

'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import type { Prospect, RoundEvidence } from '@/types';
import { QUALIFICATION_ROUNDS, isFullyQualified, roundStatus } from '@/types';

const BADGE = {
  pass: 'bg-green-100 text-green-800',
  fail: 'bg-red-100 text-red-700',
  pending: 'bg-gray-100 text-gray-500',
} as const;

const CRITERIA: Record<number, string> = {
  1: 'Real operating business in real estate or landlord space, not a competitor, not a platform, not a large enterprise.',
  2: 'A real public profile or page matches this exact person at this company, in a relevant and current role (LinkedIn or Google).',
  3: 'Their business or audience manages, invests in, or advises people who manage rentals. Passes at 60 or above.',
};

function reasonOf(p: Prospect, round: 1 | 2 | 3) {
  return round === 1 ? p.round1_reason : round === 2 ? p.round2_reason : p.round3_reason;
}

function evidenceOf(p: Prospect, round: 1 | 2 | 3): RoundEvidence | undefined {
  return p.qualification_evidence?.[`round${round}` as 'round1' | 'round2' | 'round3'];
}

export default function QualificationPanel({ prospect, onChange }: { prospect: Prospect; onChange: () => void }) {
  const [running, setRunning] = useState<number | 'all' | null>(null);

  async function run(round?: 1 | 2 | 3) {
    setRunning(round ?? 'all');
    try {
      let next: number | null = round ?? null;
      let first = true;
      // With no round given, keep going until a round fails or all three pass.
      while (first || (!round && next)) {
        first = false;
        const res = await fetch(`/api/prospects/${prospect.id}/qualify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(round ? { round } : {}),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (json.skipped) {
          toast(json.skipped);
          break;
        }
        toast(`Round ${json.result.round}: ${json.result.status}`);
        next = json.next;
        if (!next) break;
      }
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Qualification failed');
      onChange();
    } finally {
      setRunning(null);
    }
  }

  async function override(round: 1 | 2 | 3, value: string) {
    if (!value) return;
    const status = value === 'reset' ? null : value;
    const res = await fetch(`/api/prospects/${prospect.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [`round${round}_status`]: status, [`round${round}_reason`]: status ? 'Manual override.' : null }),
    });
    const json = await res.json();
    if (!res.ok) toast.error(json.error ?? 'Override failed');
    else onChange();
  }

  const nextPending = ([1, 2, 3] as const).find((r) => !roundStatus(prospect, r));
  const blockedBy = nextPending && nextPending > 1 && roundStatus(prospect, (nextPending - 1) as 1 | 2) !== 'pass' ? nextPending - 1 : null;
  const qualified = isFullyQualified(prospect);

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Qualification</h2>
        {nextPending && !blockedBy && (
          <button className="btn-primary" onClick={() => run()} disabled={running !== null}>
            {running === 'all' ? 'Running…' : nextPending === 1 ? 'Run all rounds' : `Continue from round ${nextPending}`}
          </button>
        )}
        {qualified && <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">Qualified. Email can be revealed.</span>}
      </div>

      {QUALIFICATION_ROUNDS.map(({ round, label }) => {
        const status = roundStatus(prospect, round) ?? 'pending';
        const reason = reasonOf(prospect, round);
        const evidence = evidenceOf(prospect, round);
        const locked = round > 1 && roundStatus(prospect, (round - 1) as 1 | 2) !== 'pass';
        return (
          <div key={round} className="space-y-1 border-t pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">
                  Round {round}: {label}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE[status]}`}>{status === 'pending' ? 'not run' : status}</span>
              </div>
              <div className="flex items-center gap-2">
                {!locked && (
                  <button className="text-xs text-grove-dark hover:underline" onClick={() => run(round)} disabled={running !== null}>
                    {running === round ? 'Running…' : status === 'pending' ? 'Run' : 'Re-run'}
                  </button>
                )}
                <select className="rounded border border-gray-200 px-1 py-0.5 text-xs text-gray-500" value="" onChange={(e) => override(round, e.target.value)}>
                  <option value="">Override…</option>
                  <option value="pass">Mark pass</option>
                  <option value="fail">Mark fail</option>
                  <option value="reset">Reset</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-400">{CRITERIA[round]}</p>
            {reason && <p className="text-sm text-gray-700">{reason}</p>}
            {locked && status === 'pending' && <p className="text-xs text-gray-400">Waiting on round {round - 1} to pass.</p>}
            {evidence && (evidence.results.length > 0 || evidence.apollo || evidence.apolloError) && (
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer">Evidence ({evidence.results.length} results)</summary>
                <div className="mt-2 space-y-2">
                  {evidence.apollo && (
                    <p>
                      Apollo: {evidence.apollo.industry ?? 'industry n/a'}, {evidence.apollo.employees ?? 'headcount n/a'} employees
                      {evidence.apollo.description ? `. ${evidence.apollo.description}` : ''}
                    </p>
                  )}
                  {evidence.apolloError && <p className="text-red-600">{evidence.apolloError}</p>}
                  <p className="text-gray-400">Searched: {evidence.queries.join('  |  ')}</p>
                  {evidence.results.map((r) => (
                    <div key={r.link}>
                      <a href={r.link} target="_blank" rel="noreferrer" className="text-grove-dark hover:underline">
                        {r.title || r.link}
                      </a>
                      <div className="break-all text-gray-400">{r.link}</div>
                      <div>{r.snippet}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

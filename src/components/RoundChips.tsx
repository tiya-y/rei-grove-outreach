import type { Prospect } from '@/types';
import { QUALIFICATION_ROUNDS, roundStatus } from '@/types';

const STYLE = {
  pass: 'bg-green-100 text-green-800',
  fail: 'bg-red-100 text-red-700',
  pending: 'bg-gray-100 text-gray-400',
} as const;

const WORD = { pass: 'pass', fail: 'fail', pending: 'not run' } as const;

// Three compact tags, one per qualification round: green pass, red fail,
// gray not yet run. Hover for the reason.
export default function RoundChips({ prospect }: { prospect: Prospect }) {
  return (
    <div className="flex gap-1">
      {QUALIFICATION_ROUNDS.map(({ round, label }) => {
        const status = roundStatus(prospect, round) ?? 'pending';
        const reason = round === 1 ? prospect.round1_reason : round === 2 ? prospect.round2_reason : prospect.round3_reason;
        return (
          <span
            key={round}
            title={`Round ${round} (${label}): ${WORD[status]}${reason ? `. ${reason}` : ''}`}
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${STYLE[status]}`}
          >
            R{round} {WORD[status]}
          </span>
        );
      })}
    </div>
  );
}

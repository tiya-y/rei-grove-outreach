import { PROSPECT_STAGES, type ProspectStage } from '@/types';

const STAGE_STYLES: Record<ProspectStage, string> = {
  new: 'bg-gray-100 text-gray-700',
  researched: 'bg-indigo-100 text-indigo-700',
  reached_out: 'bg-blue-100 text-blue-700',
  replied: 'bg-purple-100 text-purple-700',
  in_discussion: 'bg-amber-100 text-amber-800',
  partner_live: 'bg-green-100 text-green-800',
  affiliate_active: 'bg-green-100 text-green-800',
  stalled: 'bg-orange-100 text-orange-700',
  pass: 'bg-red-100 text-red-700',
};

export default function StageBadge({ stage }: { stage: ProspectStage }) {
  const label = PROSPECT_STAGES.find((s) => s.key === stage)?.label ?? stage;
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${STAGE_STYLES[stage] ?? 'bg-gray-100 text-gray-700'}`}>{label}</span>;
}

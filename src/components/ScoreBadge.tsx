const TIER_STYLES: Record<string, string> = {
  'Priority A': 'bg-green-100 text-green-800',
  'Priority B': 'bg-blue-100 text-blue-800',
  'Priority C': 'bg-yellow-100 text-yellow-800',
  Deprioritize: 'bg-gray-100 text-gray-600',
};

export default function ScoreBadge({ score, tier }: { score: number | null; tier?: string | null }) {
  if (score == null) return <span className="text-xs text-gray-400">Not scored</span>;
  const style = tier ? TIER_STYLES[tier] ?? 'bg-gray-100 text-gray-600' : 'bg-gray-100 text-gray-600';
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${style}`}>
      {score}
      {tier ? ` · ${tier}` : ''}
    </span>
  );
}

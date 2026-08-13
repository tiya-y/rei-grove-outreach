import type { Message } from '@/types';

function formatDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString();
}

// A log of outreach emails generated/marked sent for a prospect. There's no
// inbound side here — this app never reads a reply, so every row is
// something sent, not a conversation thread.
export default function SentLog({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-gray-400">Nothing sent yet. Generate a draft below, copy it, and mark it sent once you've sent it from your own inbox.</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <div key={m.id} className="rounded-lg border border-grove-light bg-grove-light/40 p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
            <span className="font-medium text-gray-700">
              Sent to {m.to_address ?? ''} {m.sequence_step > 1 ? `· Follow-up #${m.sequence_step}` : '· Initial'}
            </span>
            <span>{formatDate(m.sent_at)}</span>
          </div>
          {m.subject && <div className="text-sm font-medium text-gray-900">{m.subject}</div>}
          <div className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{m.body_text}</div>
        </div>
      ))}
    </div>
  );
}

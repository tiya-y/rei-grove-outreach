import type { Message } from '@/types';

function formatDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString();
}

export default function ThreadView({ messages, onUseDraft }: { messages: Message[]; onUseDraft?: (subject: string, body: string) => void }) {
  if (messages.length === 0) {
    return <p className="text-sm text-gray-400">No messages yet. Send the first outreach email below, or run a sync if you expect replies to already be in Outlook.</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`rounded-lg border p-3 ${m.direction === 'outbound' ? 'ml-6 border-grove-light bg-grove-light/40' : 'mr-6 border-gray-200 bg-gray-50'}`}
        >
          <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
            <span className="font-medium text-gray-700">{m.direction === 'outbound' ? `You → ${m.to_address ?? ''}` : `${m.from_address ?? 'Prospect'} → You`}</span>
            <span>{formatDate(m.sent_at ?? m.received_at)}</span>
          </div>
          {m.subject && <div className="text-sm font-medium text-gray-900">{m.subject}</div>}
          <div className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{m.body_text ?? m.body_html}</div>
          {m.direction === 'inbound' && m.ai_classification && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="rounded-full bg-purple-100 px-2 py-0.5 font-medium text-purple-700">{m.ai_classification.replace(/_/g, ' ')}</span>
              {m.ai_confidence != null && <span className="text-gray-400">confidence {Math.round(m.ai_confidence * 100)}%</span>}
            </div>
          )}
          {m.direction === 'inbound' && m.ai_suggested_response && (
            <div className="mt-2 rounded bg-white p-2 text-xs text-gray-600">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-gray-500">Suggested response:</span>
                {onUseDraft && (
                  <button
                    className="text-grove-dark hover:underline"
                    onClick={() => onUseDraft(m.subject ? `Re: ${m.subject}` : 'Re:', m.ai_suggested_response!)}
                  >
                    Use this draft
                  </button>
                )}
              </div>
              {m.ai_suggested_response}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

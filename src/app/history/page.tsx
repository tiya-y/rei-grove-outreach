'use client';

import Link from 'next/link';
import useSWRLike from '@/lib/useSWRLike';
import type { ProspectBatch } from '@/types';

interface Communication {
  prospect_id: string;
  name: string;
  prospect_type: string;
  stage: string;
  message_count: number;
  last_activity_at: string;
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function HistoryPage() {
  const { data: batchData, loading: batchesLoading } = useSWRLike<{ batches: ProspectBatch[] }>('/api/batches');
  const { data: commsData, loading: commsLoading } = useSWRLike<{ communications: Communication[] }>('/api/communications');

  const batches = batchData?.batches ?? [];
  const communications = commsData?.communications ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">History</h1>
        <p className="text-sm text-gray-500">Every prospect list ever imported, and every email thread with anyone reached out to.</p>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-gray-900">Prospect batches</h2>
          <p className="text-xs text-gray-500">One row per bulk import (n8n discovery workflows). Manually-added prospects aren&apos;t batched.</p>
        </div>
        {batchesLoading && <p className="p-4 text-sm text-gray-400">Loading…</p>}
        {!batchesLoading && batches.length === 0 && (
          <p className="p-4 text-sm text-gray-400">No batches yet — point an n8n discovery workflow at /api/webhooks/n8n/prospects (see Settings).</p>
        )}
        {batches.length > 0 && (
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Label</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Prospects</th>
                <th className="px-4 py-2">Imported</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{b.label ?? b.source_ref ?? 'Untitled batch'}</td>
                  <td className="px-4 py-3 text-gray-600">{b.source}</td>
                  <td className="px-4 py-3 text-gray-600">{b.prospect_count}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDateTime(b.created_at)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/search?batch=${b.id}`} className="text-grove-dark hover:underline">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card overflow-hidden p-0">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-gray-900">Communications</h2>
          <p className="text-xs text-gray-500">Every prospect with at least one email — click through for the full thread.</p>
        </div>
        {commsLoading && <p className="p-4 text-sm text-gray-400">Loading…</p>}
        {!commsLoading && communications.length === 0 && <p className="p-4 text-sm text-gray-400">No email activity yet.</p>}
        {communications.length > 0 && (
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Messages</th>
                <th className="px-4 py-2">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {communications.map((c) => (
                <tr key={c.prospect_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/prospects/${c.prospect_id}`} className="font-medium text-grove-dark hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-600">{c.prospect_type}</td>
                  <td className="px-4 py-3 text-gray-600">{c.message_count}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDateTime(c.last_activity_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

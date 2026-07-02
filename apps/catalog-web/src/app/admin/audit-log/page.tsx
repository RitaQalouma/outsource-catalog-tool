
'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/adminClient';

interface AuditEntry {
  id: string;
  actorId: string | null;
  actorEmail?: string | null;
  actorRole?: unknown;
  action: string;
  targetType: string;
  targetId: string;
  occurredAt: string;
  beforeState?: unknown;
  afterState?: unknown;
  context?: Record<string, unknown> | null;
}

interface Filters {
  action: string;
  tableName: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { action: '', tableName: '', from: '', to: '' };

const fmtDate = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

const shortId = (v: string | null | undefined) => (v ? `${v.slice(0, 8)}…` : '—');

// Check if a string is a UUID (simple regex) and not a vendor- prefixed ID.
const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const isVendorAction = (id: string) => id?.startsWith('vendor-');
const isProductId = (id: string) => id && !isVendorAction(id) && isUUID(id);

const isPlainObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const asText = (v: unknown) =>
  v === null || v === undefined
    ? '—'
    : typeof v === 'object'
      ? JSON.stringify(v, null, 2)
      : String(v);

function diffStates(before: unknown, after: unknown) {
  if (!isPlainObject(before) || !isPlainObject(after)) return null;
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  const rows = keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({ key: k, old: before[k], new: after[k] }));
  return rows;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);

  const pageSize = 50;

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (filters.action) params.set('action', filters.action);
      if (filters.tableName) params.set('tableName', filters.tableName);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);

      const data = await adminApi<{ items: AuditEntry[]; total: number }>(
        `/audit-log?${params.toString()}`,
      );
      setLogs(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters]);

  const applyFilters = () => {
    setExpandedId(null);
    setPage(0);
    setFilters(draft);
  };
  const clearFilters = () => {
    setExpandedId(null);
    setPage(0);
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-7xl p-6 bg-gray-50 min-h-screen">
      <h1 className="heading-page text-base">Audit Log</h1>
      <p className="text-xs text-slate-500 mt-1">History of all changes in the catalog.</p>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-slate-500">
          Action
          <input
            value={draft.action}
            onChange={(e) => setDraft({ ...draft, action: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="contains…"
            className="form-input mt-1 w-48"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Target (table)
          <input
            value={draft.tableName}
            onChange={(e) => setDraft({ ...draft, tableName: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="catalog.products"
            className="form-input mt-1 w-52"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          From
          <input
            type="date"
            value={draft.from}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            className="form-input mt-1"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          To
          <input
            type="date"
            value={draft.to}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            className="form-input mt-1"
          />
        </label>
        <button onClick={applyFilters} disabled={loading} className="btn-primary">
          Apply
        </button>
        <button onClick={clearFilters} disabled={loading} className="btn-link">
          Clear
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-4 table-wrapper">
        <table className="table-base">
          <thead className="table-header">
            <tr>
              <th className="table-header-cell">Action</th>
              <th className="table-header-cell">Target</th>
              <th className="table-header-cell">Record</th>
              <th className="table-header-cell">Actor</th>
              <th className="table-header-cell">Date</th>
            </tr>
          </thead>
          <tbody className="table-body">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  No audit entries match.
                </td>
              </tr>
            ) : (
              logs.map((entry) => {
                const isOpen = expandedId === entry.id;
                const diff = diffStates(entry.beforeState, entry.afterState);
                return (
                  <FragmentRow
                    key={entry.id}
                    entry={entry}
                    isOpen={isOpen}
                    diff={diff}
                    onToggle={() => setExpandedId(isOpen ? null : entry.id)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>{total} total entries</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="btn-secondary"
          >
            Previous
          </button>
          <span className="tabular-nums">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
            disabled={page + 1 >= totalPages || loading}
            className="btn-secondary"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------- row + expandable detail ----------------------- */
function FragmentRow({
  entry,
  isOpen,
  diff,
  onToggle,
}: {
  entry: AuditEntry;
  isOpen: boolean;
  diff: { key: string; old: unknown; new: unknown }[] | null;
  onToggle: () => void;
}) {
  // Determine what to show in the "Record" column.
  const renderRecord = () => {
    if (isProductId(entry.targetId)) {
      return (
        <a
          href={`/admin/catalog/${entry.targetId}`}
          className="text-indigo-600 hover:underline font-mono text-xs"
          title={entry.targetId}
        >
          {shortId(entry.targetId)}
        </a>
      );
    }
    // Vendor action: show vendor name from context if available.
    if (isVendorAction(entry.targetId)) {
      const vendorName = entry.context?.vendorName as string | undefined;
      return (
        <span className="font-mono text-xs" title={entry.targetId}>
          {vendorName || shortId(entry.targetId)}
        </span>
      );
    }
    // Fallback: just short ID (should not happen)
    return <span className="font-mono text-xs">{shortId(entry.targetId)}</span>;
  };

  return (
    <>
      <tr className="table-row cursor-pointer" onClick={onToggle}>
        <td className="table-body-cell">{entry.action}</td>
        <td className="table-body-cell font-mono text-xs">{entry.targetType}</td>
        <td className="table-body-cell">{renderRecord()}</td>
        <td
          className="table-body-cell text-xs"
          title={entry.actorEmail ?? entry.actorId ?? undefined}
        >
          {entry.actorEmail ?? shortId(entry.actorId)}
        </td>
        <td className="table-body-cell text-xs">{fmtDate(entry.occurredAt)}</td>
      </tr>

      {isOpen && (
        <tr className="bg-slate-50/70">
          <td colSpan={5} className="px-5 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Metadata
                </h4>
                <dl className="mt-1 space-y-1 text-xs">
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">Actor</dt>
                    <dd className="min-w-0 break-all text-slate-800">
                      {entry.actorEmail ?? '—'}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">Actor ID</dt>
                    <dd className="min-w-0 break-all font-mono text-slate-800">
                      {entry.actorId ?? '—'}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">Target</dt>
                    <dd className="min-w-0 break-all font-mono text-slate-800">
                      {entry.targetType} · {entry.targetId}
                    </dd>
                  </div>
                  {entry.actorRole != null && (
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0 text-slate-500">Role</dt>
                      <dd className="min-w-0 break-words text-slate-800">{asText(entry.actorRole)}</dd>
                    </div>
                  )}
                  {entry.context != null && (
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0 text-slate-500">Context</dt>
                      <dd className="min-w-0 break-words">
                        <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-600">
                          {asText(entry.context)}
                        </pre>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Change
                </h4>
                {diff && diff.length > 0 ? (
                  <dl className="mt-1 space-y-1 text-xs">
                    {diff.map((d) => (
                      <div key={d.key} className="flex flex-wrap items-center gap-1.5">
                        <dt className="w-28 shrink-0 text-slate-500">{d.key}</dt>
                        <dd className="flex flex-wrap items-center gap-1.5">
                          <span className="text-slate-400 line-through break-all">{asText(d.old)}</span>
                          <span className="text-slate-300">→</span>
                          <span className="font-medium text-emerald-700 break-all">{asText(d.new)}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : diff && diff.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-400">No field changes recorded.</p>
                ) : (
                  // States aren't both objects (e.g. an insert with before=null) — show raw.
                  <div className="mt-1 grid gap-2">
                    <div>
                      <span className="text-[11px] text-slate-500">Before</span>
                      <pre className="mt-0.5 whitespace-pre-wrap rounded bg-white p-2 font-mono text-[11px] text-slate-600 ring-1 ring-slate-100">
                        {asText(entry.beforeState)}
                      </pre>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500">After</span>
                      <pre className="mt-0.5 whitespace-pre-wrap rounded bg-white p-2 font-mono text-[11px] text-emerald-800 ring-1 ring-emerald-100">
                        {asText(entry.afterState)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
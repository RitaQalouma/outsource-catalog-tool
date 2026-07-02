'use client';

import { useState } from 'react';

type ExportFilter = 'published' | 'unpublished' | 'updated' | 'all';

export default function ExportPage() {
  const [filter, setFilter] = useState<ExportFilter>('published');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter === 'all') {
        params.set('all', 'true');
      } else if (filter === 'unpublished') {
        params.set('unpublishedOnly', 'true');
      } else if (filter === 'updated') {
        params.set('updatedOnly', 'true');
      } else {
        params.set('publishedOnly', 'true');
      }

      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'}/export/shopify?${params.toString()}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error(`Export failed (${res.status})`);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `catalog-export-${filter}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg p-6 bg-gray-50 min-h-screen">
      <h1 className="heading-page text-base">Catalog Export</h1>
      <p className="mt-1 text-xs text-slate-500">Download a CSV with all catalog fields.</p>

      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="card mt-4">
        <fieldset>
          <legend className="form-label mb-3">Export filter</legend>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="exportFilter"
                value="published"
                checked={filter === 'published'}
                onChange={() => setFilter('published')}
                className="accent-indigo-600"
              />
              Published only
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="exportFilter"
                value="updated"
                checked={filter === 'updated'}
                onChange={() => setFilter('updated')}
                className="mt-0.5 accent-indigo-600"
              />
              <span>
                Updated since last export
                <span className="block text-xs text-slate-400">
                  Products changed since last export.
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="exportFilter"
                value="unpublished"
                checked={filter === 'unpublished'}
                onChange={() => setFilter('unpublished')}
                className="accent-indigo-600"
              />
              Unpublished only (not archived)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="exportFilter"
                value="all"
                checked={filter === 'all'}
                onChange={() => setFilter('all')}
                className="accent-indigo-600"
              />
              All products (including archived)
            </label>
          </div>
        </fieldset>

        <button onClick={handleDownload} disabled={downloading} className="btn-primary mt-4 w-full">
          {downloading ? 'Generating CSV…' : 'Download Catalog CSV'}
        </button>
      </div>

      <div className="mt-6 text-xs text-slate-400">
        <p className="mb-1 font-medium">CSV columns:</p>
        <p>
          productCode, normalizedCode, description, category, uses, dateLastUpdated,
          costPerUom, uom, weightLbs, margin, caseQty, dimensions, notes,
          shopifyStatus, published, archivedAt, handle, productInformationList,
          altProductList, imageUrls, manufacturerUrls, submittalUrls,
          vendorName, typeName, tags, createdAt, updatedAt
        </p>
      </div>
    </div>
  );
}
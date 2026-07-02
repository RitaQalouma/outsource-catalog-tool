'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { stripTags } from '@/lib/parseBodyHtml';
import { createClient } from '@/lib/supabase/client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const STORAGE_KEY = 'ingest_batch_id';

/* ----------------------------- field config ----------------------------- */

const REQUIRED_FIELDS = ['productCode', 'normalizedCode', 'uom'];
const OPTIONAL_FIELDS = [
  'description',
  'uses',
  'dateLastUpdated',
  'costPerUom',
  'weightLbs',
  'margin',
  'caseQty',
  'dimensions',
  'notes',
  'vendorId',
  'typeId',
  'published',
  'shopifyStatus',
  'handle',
  'imageUrls',
  'manufacturerUrls',
  'submittalUrls',
  'productInformationList',
  'altProductList',
];
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
const SOURCE_FIELDS = ['price'] as const; // only price remains

const FIELD_GROUPS: { label: string; fields: string[] }[] = [
  { label: 'Identity', fields: ['productCode', 'normalizedCode', 'description', 'handle'] },
  { label: 'Classification', fields: ['typeId', 'vendorId'] },
  { label: 'Pricing', fields: ['costPerUom', 'margin'] },
  { label: 'Logistics', fields: ['uom', 'caseQty', 'weightLbs', 'dimensions'] },
  { label: 'Content & uses', fields: ['uses', 'notes', 'dateLastUpdated'] },
  { label: 'Links & Images', fields: ['imageUrls', 'manufacturerUrls', 'submittalUrls'] },
  { label: 'Lists', fields: ['productInformationList', 'altProductList'] },
  { label: 'Flags', fields: ['shopifyStatus', 'published'] },
];

const FIELD_LABELS: Record<string, string> = {
  productCode: 'SKU / Code',
  normalizedCode: 'Normalized code',
  description: 'Description',
  uses: 'Uses',
  dateLastUpdated: 'Last updated',
  costPerUom: 'Cost / UOM',
  uom: 'UOM',
  weightLbs: 'Weight (lbs)',
  margin: 'Margin',
  caseQty: 'Case qty',
  dimensions: 'Dimensions',
  notes: 'Notes',
  vendorId: 'Vendor',
  typeId: 'Type',
  published: 'Published',
  shopifyStatus: 'Shopify Active',
  handle: 'Handle',
  imageUrls: 'Image URLs (comma)',
  manufacturerUrls: 'Mfr URLs (comma)',
  submittalUrls: 'Submittal URLs (comma)',
  productInformationList: 'Product Info List (comma)',
  altProductList: 'Alternate Products (comma)',
  price: 'Sell price (for margin)',
};

const labelFor = (f: string) => FIELD_LABELS[f] ?? f;

const EXACT_SYNONYMS: Record<string, string[]> = {
  productCode: ['sku', 'product code', 'code', 'item code', 'part number', 'product', 'variant sku'],
  normalizedCode: ['normalized code', 'lookup code', 'key', 'handle'],
  description: ['description', 'desc', 'product description'],
  uses: ['uses', 'application', 'use cases'],
  dateLastUpdated: ['last updated', 'update date', 'updated at'],
  costPerUom: ['cost', 'cost per item', 'unit cost', 'net price', 'cost ($)'],
  uom: ['uom', 'unit', 'unit of measure'],
  weightLbs: ['weight', 'lbs', 'pounds', 'weight (lbs)', 'wt', 'variant grams'],
  margin: ['margin', 'profit %', 'margin %', 'profit margin', 'gp%', 'gp %', 'gross margin', 'markup', 'markup %'],
  caseQty: ['case qty', 'box qty', 'case quantity', 'qty per case', 'case pack', 'pack qty'],
  dimensions: ['dimensions', 'dims', 'size', 'lwh'],
  notes: ['notes', 'remarks'],
  vendorId: ['vendor id', 'vendor', 'supplier'],
  typeId: ['type id', 'product type', 'type'],
  published: ['published', 'shopify', 'status', 'published scope'],
  shopifyStatus: ['shopify status', 'active', 'active in shopify', 'status'],
  handle: ['handle', 'shopify handle', 'url handle'],
  imageUrls: ['image urls', 'images', 'image links', 'image srcs'],
  manufacturerUrls: ['manufacturer urls', 'mfr urls', 'manufacturer links'],
  submittalUrls: ['submittal urls', 'spec urls', 'submittal links'],
  productInformationList: ['product info list', 'features', 'bullet points', 'information list'],
  altProductList: ['alternate products', 'alt products', 'related products', 'cross reference'],
  price: ['variant price', 'price', 'unit price', 'sell price', 'retail price', 'list price'],
};

function exactAutoMap(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  for (const field of [...ALL_FIELDS, ...SOURCE_FIELDS]) {
    const synonyms = EXACT_SYNONYMS[field] || [];
    const idx = lowerHeaders.findIndex(h => synonyms.includes(h));
    if (idx !== -1) mapping[field] = headers[idx];
  }
  return mapping;
}

function parseFieldValue(field: string, raw: any): any {
  if (raw === undefined || raw === null) return null;
  const str = raw.toString().trim();
  if (str === '') return null;
  if (['costPerUom', 'price', 'margin', 'weightLbs'].includes(field)) {
    const n = parseFloat(str.replace(/[^0-9.-]/g, ''));
    return Number.isNaN(n) ? null : n;
  }
  if (field === 'caseQty') {
    const n = parseInt(str.replace(/[^0-9]/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }
  if (['published', 'shopifyStatus'].includes(field)) {
    return /^(true|yes|1|active|published)$/i.test(str);
  }
  return str;
}

function computeMargin(price: number | null, cost: number | null): number | null {
  if (price == null || cost == null || price <= 0) return null;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

interface EnrichResult {
  mapped: Record<string, any>;
  price: number | null;
  marginCalculated: boolean;
}

function enrichRow(raw: Record<string, any>, mapping: Record<string, string>, calc: boolean): EnrichResult {
  const mapped: Record<string, any> = {};

  // Direct mapping for all fields (no bodyHtml extraction)
  for (const field of ALL_FIELDS) {
    const col = mapping[field];
    if (!col) continue;
    if (['imageUrls', 'manufacturerUrls', 'submittalUrls', 'productInformationList', 'altProductList'].includes(field)) continue;
    const v = parseFieldValue(field, raw[col]);
    if (v !== null) mapped[field] = v;
  }

  // Array fields (comma-separated)
  const arrayFields = ['imageUrls', 'manufacturerUrls', 'submittalUrls'];
  for (const field of arrayFields) {
    const col = mapping[field];
    if (col && raw[col] !== undefined && raw[col] !== null) {
      const rawVal = String(raw[col]).trim();
      if (rawVal) {
        mapped[field] = rawVal.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
  }
  const jsonArrayFields = ['productInformationList', 'altProductList'];
  for (const field of jsonArrayFields) {
    const col = mapping[field];
    if (col && raw[col] !== undefined && raw[col] !== null) {
      const rawVal = String(raw[col]).trim();
      if (rawVal) {
        mapped[field] = rawVal.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
  }

  // Normalized code
  if (!mapped.normalizedCode && mapped.productCode) {
    mapped.normalizedCode = String(mapped.productCode).toUpperCase().replace(/\s+/g, '');
  }

  // Margin calculation
  const price = mapping.price ? parseFieldValue('price', raw[mapping.price]) : null;
  let marginCalculated = false;
  if (calc && (mapped.margin === undefined || mapped.margin === null)) {
    const m = computeMargin(price, mapped.costPerUom ?? null);
    if (m != null) { mapped.margin = m; marginCalculated = true; }
  }

  return { mapped, price, marginCalculated };
}

/* ------------------------------- UI atoms -------------------------------- */

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600 ring-slate-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-600 ring-rose-200',
  committed: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  needs_review: 'bg-amber-50 text-amber-700 ring-amber-200',
  error: 'bg-rose-50 text-rose-700 ring-rose-300',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'pending', approved: 'approved', rejected: 'rejected',
  committed: 'committed', needs_review: 'needs review', error: 'error',
};

const SHORT_RESOLUTIONS = ['merge', 'overwrite', 'skip', 'restore'];

function StatusChip({ status, resolution }: { status: string; resolution?: string }) {
  const showRes = resolution && SHORT_RESOLUTIONS.includes(resolution);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_STYLE[status] ?? STATUS_STYLE.pending}`}>
      <span className="capitalize">{STATUS_LABEL[status] ?? status}</span>
      {showRes && <span className="opacity-60">· {resolution}</span>}
    </span>
  );
}

const fmtMoney = (v: any) =>
  v == null || v === '' || Number.isNaN(Number(v)) ? '—' : `$${Number(v).toFixed(2)}`;
const fmtPct = (v: any) =>
  v == null || v === '' || Number.isNaN(Number(v)) ? '—' : `${Number(v).toFixed(1)}%`;
const fmtCell = (v: any) => {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
};
const asText = (v: any) => {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.join(', ');
  const s = typeof v === 'string' ? stripTags(v) : String(v);
  return s || '—';
};
const isUrl = (v: any) => typeof v === 'string' && /^https?:\/\//i.test(v);

type MatchType = 'new' | 'existing' | 'possible_duplicate' | 'conflict';
function matchTypeOf(row: any): MatchType {
  if (row.matchType) return row.matchType as MatchType;
  return row.matchedProductId ? 'existing' : 'new';
}
const MATCH_STYLE: Record<MatchType, string> = {
  new: 'text-emerald-600',
  existing: 'text-amber-600',
  possible_duplicate: 'text-orange-600',
  conflict: 'text-rose-600',
};
const MATCH_LABEL: Record<MatchType, string> = {
  new: 'New', existing: 'Existing', possible_duplicate: 'Possible dup', conflict: 'Conflict',
};
function candidateIds(row: any): string[] | null {
  const r = row?.resolution;
  if (typeof r === 'string' && r.startsWith('{')) {
    try { const o = JSON.parse(r); return Array.isArray(o.ambiguous) ? o.ambiguous : null; }
    catch { return null; }
  }
  return null;
}
function conflictNote(row: any): string | null {
  const r = row?.resolution;
  return typeof r === 'string' && r.length > 0 && !r.startsWith('{') && !SHORT_RESOLUTIONS.includes(r) ? r : null;
}

/* ------------------------------- component ------------------------------- */

type Step = 'upload' | 'map' | 'review';
type Filter = 'all' | 'pending' | 'needs_review' | 'approved' | 'rejected';

export default function IngestPage() {
  const [step, setStep] = useState<Step>('upload');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [localMode, setLocalMode] = useState(false);

  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, any>[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [calculateMargin, setCalculateMargin] = useState(true);

  const [rows, setRows] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'info' | 'warn' | 'error' | 'ok'; text: string } | null>(null);

  const [filterStatus, setFilterStatus] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [editModal, setEditModal] = useState<any | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const [compare, setCompare] = useState<any | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [htmlSource, setHtmlSource] = useState(false);

  const [openBatches, setOpenBatches] = useState<any[]>([]);
  const [pdfExtracting, setPdfExtracting] = useState(false);

  const [page, setPage] = useState(1);
  const pageSize = 20;

  // auth helper
  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      return fetch(url, {
        ...options,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {}),
        },
      });
    },
    [],
  );

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setBatchId(saved);
  }, []);

  useEffect(() => {
    if (step === 'upload') {
      authFetch(`${API_BASE}/ingest/batches`)
        .then(res => (res.ok ? res.json() : []))
        .then(data => setOpenBatches(Array.isArray(data) ? data : []))
        .catch(() => setOpenBatches([]));
    }
  }, [step, authFetch]);

  const saveBatchId = (id: string) => { localStorage.setItem(STORAGE_KEY, id); setBatchId(id); };
  const clearBatch = () => {
    localStorage.removeItem(STORAGE_KEY);
    setBatchId(null); setRows([]); setParsedRows([]); setFile(null);
    setExpandedRowId(null); setQuery(''); setFilterStatus('all');
    setLocalMode(false); setStep('upload');
    setPage(1);
  };

  const goToMap = () => {
    setStep('map');
  };

  useEffect(() => { setPage(1); }, [filterStatus, query]);

  // Upload
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const f = acceptedFiles[0];
    if (!f) return;
    setFile(f);
    setNotice(null);

    // PDF branch (kept for future, but currently not used)
    if (f.name.toLowerCase().endsWith('.pdf')) {
      setPdfExtracting(true);
      const formData = new FormData();
      formData.append('file', f);
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      try {
        const res = await fetch(`${API_BASE}/ingest/pdf/extract`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        if (!res.ok) throw new Error(`Extraction failed (${res.status})`);
        const data = await res.json();
        const headers = data.headers || [];
        const rows = data.rows || [];
        if (rows.length === 0) {
          setNotice({ kind: 'error', text: 'No products could be extracted from the PDF.' });
          return;
        }
        setCsvHeaders(headers);
        setParsedRows(rows);
        const auto = exactAutoMap(headers);
        const newMapping: Record<string, string> = {};
        [...ALL_FIELDS, ...SOURCE_FIELDS].forEach(field => { newMapping[field] = auto[field] || ''; });
        setMapping(newMapping);
        setCalculateMargin(!auto.margin);
        setStep('map');
      } catch (err) {
        setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'PDF extraction failed' });
      } finally {
        setPdfExtracting(false);
      }
      return;
    }

    // CSV branch
    Papa.parse<Record<string, any>>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        let h = results.meta.fields || [];
        const dataRows = (results.data as Record<string, any>[]) || [];
        if (h.length === 0 && dataRows.length > 0) h = Object.keys(dataRows[0]);
        setCsvHeaders(h);
        setParsedRows(dataRows);
        const auto = exactAutoMap(h);
        const newMapping: Record<string, string> = {};
        [...ALL_FIELDS, ...SOURCE_FIELDS].forEach(field => { newMapping[field] = auto[field] || ''; });
        setMapping(newMapping);
        setCalculateMargin(!auto.margin);
        setStep('map');
      },
      error: () => setNotice({ kind: 'error', text: 'Could not parse CSV.' }),
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: { 'text/csv': ['.csv'], 'application/pdf': ['.pdf'] },
    disabled: pdfExtracting || uploading,
  });

  // Mapping
  const requiredUnmapped = REQUIRED_FIELDS.filter(f => !mapping[f]);

  const handleApplyMapping = async () => {
    if (requiredUnmapped.length > 0) return;
    setUploading(true);
    setNotice(null);

    const enriched: any[] = [];
    let skipped = 0;
    parsedRows.forEach((raw, i) => {
      const { mapped } = enrichRow(raw, mapping, calculateMargin);
      if (!mapped.productCode && !mapped.normalizedCode) { skipped++; return; }
      enriched.push({ sourceRow: i, mappedData: mapped });
    });

    if (enriched.length === 0) {
      setNotice({ kind: 'error', text: 'No rows have a product code.' });
      setUploading(false);
      return;
    }

    try {
      const res = await authFetch(`${API_BASE}/ingest/stage`, {
        method: 'POST',
        body: JSON.stringify({ rows: enriched.map(e => e.mappedData), calculateMargin }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      saveBatchId(data.batchId);
      setRows(data.rows || enriched.map(toLocalRow));
      setLocalMode(false);
      setNotice(skipped > 0
        ? { kind: 'warn', text: `Staged ${enriched.length} rows. Skipped ${skipped} without product code.` }
        : { kind: 'ok', text: `Staged ${enriched.length} rows.` });
      setStep('review');
    } catch {
      setRows(enriched.map(toLocalRow));
      setBatchId(null);
      setLocalMode(true);
      setNotice({ kind: 'warn', text: `Local preview — backend ${API_BASE}/ingest/stage unreachable.` });
      setStep('review');
    } finally {
      setUploading(false);
    }
  };

  const toLocalRow = (e: any) => ({
    id: `local-${e.sourceRow}`,
    status: 'pending' as const,
    mappedData: e.mappedData,
    matchedProductId: null,
    matchType: 'new' as MatchType,
    diff: {},
  });

  // Review actions (unchanged)
  const refreshRows = async () => {
    if (!batchId || localMode) return;
    try {
      const res = await authFetch(`${API_BASE}/ingest/batches/${batchId}/rows`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : data?.rows || []);
    } catch { /* ignore */ }
  };

  const setRowLocally = (rowId: string, patch: any) =>
    setRows(prev => prev.map(r => (r.id === rowId ? { ...r, ...patch } : r)));

  const handleRowStatus = async (rowId: string, status: string, resolution?: string) => {
    if (localMode) { setRowLocally(rowId, { status, resolution }); return; }
    setRowLocally(rowId, { status, resolution });
    try {
      await authFetch(`${API_BASE}/ingest/rows/${rowId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, resolution }),
        headers: { 'Content-Type': 'application/json' },
      });
      await refreshRows();
    } catch { /* optimistic */ }
  };

  const handleResolve = async (rowId: string, productId: string | null) => {
    if (localMode) {
      setRowLocally(rowId, {
        status: 'pending', matchedProductId: productId,
        matchType: productId ? 'existing' : 'new', resolution: null,
      });
      return;
    }
    try {
      const res = await authFetch(`${API_BASE}/ingest/rows/${rowId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ productId }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(String(res.status));
      await refreshRows();
    } catch {
      setNotice({ kind: 'error', text: 'Could not resolve this row. Is the resolve endpoint wired up?' });
    }
  };

  const bulkApprovePending = () => {
    rows.filter(r => r.status === 'pending').forEach(r => handleRowStatus(r.id, 'approved'));
  };

  const handleEditOpen = (row: any) => setEditModal({
    id: row.id,
    mappedData: {
      ...(row.mappedData || {}),
      ...(row.vendorName ? { vendorId: row.vendorName } : {}),
      ...(row.typeName ? { typeId: row.typeName } : {}),
    },
  });

  const openCompare = async (row: any) => {
    setOnlyChanges(false);
    setHtmlSource(false);
    setCompare({ rowId: row.id, productCode: row.productCode, fields: [], matchType: 'existing' });
    setCompareLoading(true);
    try {
      if (localMode) throw new Error('local');
      const res = await authFetch(`${API_BASE}/ingest/rows/${row.id}/comparison`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setCompare({ ...data, productCode: row.productCode });
    } catch {
      const diff = row.diff || {};
      const fields = Object.keys(diff).map((field) => ({
        field,
        current: diff[field]?.old ?? null,
        incoming: diff[field]?.new ?? null,
        isHtml: false,
        changed: true,
      }));
      setCompare({
        rowId: row.id, productCode: row.productCode, matchType: 'existing',
        existingArchived: false, changedCount: fields.length, fields, partial: true,
      });
    } finally {
      setCompareLoading(false);
    }
  };

  const handleEditSave = async () => {
    if (!editModal) return;
    setRowLocally(editModal.id, { mappedData: editModal.mappedData });
    if (!localMode) {
      try {
        await authFetch(`${API_BASE}/ingest/rows/${editModal.id}/mapped`, {
          method: 'PATCH',
          body: JSON.stringify({ mappedData: editModal.mappedData }),
          headers: { 'Content-Type': 'application/json' },
        });
        await refreshRows();
      } catch { /* optimistic */ }
    }
    setEditModal(null);
  };

  const handleCommit = async () => {
    if (localMode || !batchId) {
      setNotice({ kind: 'warn', text: 'Commit needs the backend.' });
      return;
    }
    try {
      const res = await authFetch(`${API_BASE}/ingest/batches/${batchId}/commit`, { method: 'POST' });
      if (!res.ok) throw new Error('Commit failed');
      const result = await res.json().catch(() => null);
      const refreshRes = await authFetch(`${API_BASE}/ingest/batches/${batchId}/rows`);
      const data = await refreshRes.json();
      const currentRows = Array.isArray(data) ? data : (data?.rows || []);
      setRows(currentRows);
      const summary = result
        ? `Committed ${result.committed ?? 0} · conflicts ${result.conflicts ?? 0} · errors ${result.errors ?? 0} · skipped ${result.skipped ?? 0}.`
        : 'Commit complete.';
      const stillOpen = currentRows.some((r: any) =>
        ['pending', 'approved', 'needs_review'].includes(r.status));
      setNotice({ kind: 'ok', text: summary + (stillOpen ? ' Remaining rows stay in staging.' : '') });
    } catch (err) {
      setNotice({ kind: 'error', text: 'Commit failed: ' + (err instanceof Error ? err.message : 'unknown') });
    }
  };

  const counts = {
    total: rows.length,
    pending: rows.filter(r => r.status === 'pending').length,
    needs_review: rows.filter(r => r.status === 'needs_review').length,
    approved: rows.filter(r => r.status === 'approved').length,
    rejected: rows.filter(r => r.status === 'rejected').length,
    error: rows.filter(r => r.status === 'error').length,
  };
  const filteredRows = rows.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (query.trim()) {
      const m = r.mappedData || {};
      const hay = `${m.productCode ?? ''} ${m.normalizedCode ?? ''} ${stripTags(String(m.description ?? ''))} ${m.handle ?? ''}`.toLowerCase();
      if (!hay.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  });
  const totalPages = Math.ceil(filteredRows.length / pageSize);
  const paginatedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="mx-auto max-w-[1500px] p-6 font-sans text-slate-800">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="heading-page text-base">Catalog ingest</h1>
          <p className="text-xs text-slate-500">{step === 'upload' ? 'Upload CSV or PDF' : step === 'map' ? 'Map columns' : 'Review'}</p>
        </div>
        <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
          {(['upload', 'map', 'review'] as Step[]).map((s, i) => (
            <span key={s} className={step === s ? 'text-slate-900 font-medium' : ''}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {i < 2 && <span className="mx-1 text-slate-300">/</span>}
            </span>
          ))}
        </div>
      </header>

      {notice && (
        <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${
          notice.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' :
          notice.kind === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800' :
          notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
          'border-slate-200 bg-slate-50 text-slate-600'
        }`}>
          {notice.text}
        </div>
      )}

      {step === 'upload' && (
        <div>
          <div {...getRootProps()} className={`cursor-pointer rounded-xl border-2 border-dashed p-14 text-center transition-colors ${
            isDragActive ? 'border-slate-900 bg-slate-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
          } ${pdfExtracting ? 'opacity-50 pointer-events-none' : ''}`}>
            <input {...getInputProps()} />
            {pdfExtracting ? (
              <div className="text-sm font-medium text-slate-700">
                <div className="mb-2 mx-auto h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                Extracting products…
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-700">Drop a vendor CSV or PDF here, or click to choose</p>
                <p className="mt-1 text-xs text-slate-400">CSV: direct mapping · PDF: rule-based extraction</p>
              </>
            )}
          </div>

          {openBatches.length > 0 && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Unfinished batches</h3>
              <div className="space-y-2">
                {openBatches.map(batch => (
                  <div key={batch.id} className="flex items-center justify-between rounded bg-white px-3 py-2 border border-slate-200">
                    <div>
                      <span className="font-mono text-xs text-slate-600">{batch.id.slice(0, 8)}…</span>
                      <span className="ml-2 text-xs text-slate-400">
                        {new Date(batch.createdAt).toLocaleDateString()} · {batch.row_count} rows
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-primary" onClick={async () => {
                        saveBatchId(batch.id);
                        try {
                          const res = await authFetch(`${API_BASE}/ingest/batches/${batch.id}/rows`);
                          const data = await res.json();
                          setRows(Array.isArray(data) ? data : data?.rows || []);
                        } catch { /* ignore */ }
                        setStep('review');
                      }}>Resume</button>
                      <button className="btn-danger" onClick={async () => {
                        await authFetch(`${API_BASE}/ingest/batches/${batch.id}`, { method: 'DELETE' });
                        setOpenBatches(prev => prev.filter(b => b.id !== batch.id));
                      }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'map' && (
        <div>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="heading-section text-base">Map columns</h2>
            <span className="text-xs text-slate-500">{parsedRows.length} rows · {csvHeaders.length} columns</span>
          </div>

          <div className="mb-3 flex items-center gap-2">
            <button onClick={clearBatch} className="btn-link text-sm">← Back to upload</button>
          </div>

          <p className="mb-3 text-xs text-slate-500">
            Required fields are marked. Comma‑separated values in URL/list fields become arrays.
          </p>

          <div className="space-y-1.5">
            {[...SOURCE_FIELDS, ...ALL_FIELDS].map(field => {
              const isRequired = REQUIRED_FIELDS.includes(field);
              const isSource = (SOURCE_FIELDS as readonly string[]).includes(field);
              const satisfied = !!mapping[field];
              return (
                <div
                  key={field}
                  className={`flex flex-wrap items-center gap-3 rounded-md px-2 py-1.5 ${isSource ? 'bg-indigo-50/50' : 'odd:bg-slate-50/60'}`}
                >
                  <label className="w-44 shrink-0 text-sm">
                    <span className={isSource ? 'font-medium text-indigo-700' : isRequired ? 'font-medium text-slate-900' : 'text-slate-600'}>
                      {labelFor(field)}
                    </span>
                    {isRequired && <span className="ml-0.5 text-rose-500">*</span>}
                  </label>
                  <select
                    value={mapping[field] || ''}
                    onChange={e => setMapping({ ...mapping, [field]: e.target.value })}
                    className="form-select min-w-0 flex-1"
                  >
                    <option value="">— not mapped —</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span className="w-28 shrink-0 text-right text-xs">
                    {mapping[field] ? <span className="text-emerald-600">✓ mapped</span>
                      : isRequired ? <span className="text-rose-500">required</span>
                      : <span className="text-slate-300">optional</span>}
                  </span>
                  {field === 'price' && (
                    <label className="flex w-full items-center gap-2 pl-44 text-xs text-slate-500">
                      <input type="checkbox" checked={calculateMargin} onChange={e => setCalculateMargin(e.target.checked)} className="accent-slate-900" />
                      Calculate margin = (price − cost) ÷ price × 100
                    </label>
                  )}
                </div>
              );
            })}
          </div>

          {requiredUnmapped.length > 0 && (
            <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Map these before continuing: <strong>{requiredUnmapped.map(labelFor).join(', ')}</strong>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={handleApplyMapping}
              disabled={uploading || requiredUnmapped.length > 0}
              className="btn-primary"
            >
              {uploading ? 'Staging…' : 'Stage rows for review'}
            </button>
            <button onClick={clearBatch} className="btn-link">Start over</button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="heading-section text-base">Review staged rows</h2>
                {localMode && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Local preview</span>}
              </div>
              <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-500">
                <span>{counts.total} total</span>
                <span>{counts.pending} pending</span>
                {counts.needs_review > 0 && <span className="text-amber-600">{counts.needs_review} needs review</span>}
                <span className="text-emerald-600">{counts.approved} approved</span>
                <span className="text-rose-500">{counts.rejected} rejected</span>
                {counts.error > 0 && <span className="text-rose-600">{counts.error} error</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={goToMap} className="btn-link text-sm">← Back to mapping</button>
              <button onClick={clearBatch} className="btn-link">New import</button>
              <button
                onClick={bulkApprovePending}
                disabled={counts.pending === 0}
                className="btn-secondary"
              >
                Approve all pending
              </button>
              <button
                onClick={handleCommit}
                disabled={counts.approved === 0 || localMode}
                className="btn-primary"
              >
                Commit {counts.approved} approved
              </button>
            </div>
          </div>

          {counts.needs_review > 0 && (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {counts.needs_review} row(s) need a decision (possible duplicate or productCode conflict). They will not commit until resolved.
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-slate-200 p-0.5 text-xs">
              {(['all', 'pending', 'needs_review', 'approved', 'rejected'] as Filter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterStatus(f)}
                  className={`rounded px-2.5 py-1 capitalize transition-colors ${filterStatus === f ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  {f === 'needs_review' ? 'needs review' : f} {f === 'all' ? counts.total : counts[f as keyof typeof counts]}
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search SKU, handle, description…"
              className="form-input ml-auto w-64"
            />
          </div>

          {filteredRows.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
              No rows match. Adjust the filter or search.
            </div>
          ) : (
            <div>
              <div className="table-wrapper">
                <table className="table-base">
                  <thead className="table-header">
                    <tr>
                      {['Status', 'SKU', 'Description', 'Vendor', 'Cost', 'Margin', 'Case', 'UOM', 'Dimensions', 'Match', 'Actions'].map(h => (
                        <th key={h} className="table-header-cell !px-3 !py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="table-body">
                    {paginatedRows.map(row => {
                      const m = row.mappedData || {};
                      const diff = row.diff || {};
                      const matchType = matchTypeOf(row);
                      const hasDiff = matchType === 'existing' && Object.keys(diff).length > 0;
                      const isExpanded = expandedRowId === row.id;
                      const candidates = candidateIds(row);
                      const note = conflictNote(row);
                      return (
                        <React.Fragment key={row.id}>
                          <tr
                            className={`table-row cursor-pointer ${row.status === 'rejected' ? 'opacity-55' : ''}`}
                            onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                          >
                            <td className="table-body-cell !px-3 !py-2.5"><StatusChip status={row.status} resolution={row.resolution} /></td>
                            <td className="table-body-cell !px-3 !py-2.5 font-mono text-xs">{m.productCode || m.normalizedCode || '—'}</td>
                            <td className="table-body-cell !px-3 !py-2.5 max-w-[260px]"><span className="block truncate">{asText(m.description || m.handle)}</span></td>
                            <td className="table-body-cell !px-3 !py-2.5">{fmtCell(row.vendorName ?? m.vendorId)}</td>
                            <td className="table-body-cell !px-3 !py-2.5 tabular-nums">{fmtMoney(m.costPerUom)}</td>
                            <td className="table-body-cell !px-3 !py-2.5 tabular-nums">{fmtPct(m.margin)}</td>
                            <td className="table-body-cell !px-3 !py-2.5 tabular-nums">{m.caseQty ?? '—'}</td>
                            <td className="table-body-cell !px-3 !py-2.5">{fmtCell(m.uom)}</td>
                            <td className="table-body-cell !px-3 !py-2.5 max-w-[160px]"><span className="block truncate">{fmtCell(m.dimensions)}</span></td>
                            <td className="table-body-cell !px-3 !py-2.5">
                              <span className={MATCH_STYLE[matchType]}>
                                {MATCH_LABEL[matchType]}{hasDiff ? ` · ${Object.keys(diff).length} Δ` : ''}
                              </span>
                            </td>
                            <td className="table-body-cell !px-3 !py-2.5" onClick={e => e.stopPropagation()}>
                              {row.status === 'needs_review' ? (
                                <div className="flex flex-wrap gap-1">
                                  {candidates?.map(cid => (
                                    <button key={cid} className="btn-secondary" onClick={() => handleResolve(row.id, cid)}>
                                      Link {cid.slice(0, 8)}…
                                    </button>
                                  ))}
                                  <button className="btn-secondary" onClick={() => handleResolve(row.id, null)}>Treat as new</button>
                                  <button className="btn-link" onClick={() => handleEditOpen(row)}>Edit</button>
                                  <button className="btn-danger" onClick={() => handleRowStatus(row.id, 'rejected')}>Reject</button>
                                </div>
                              ) : row.status === 'pending' ? (
                                <div className="flex flex-wrap gap-1">
                                  <button className="btn-primary" onClick={() => handleRowStatus(row.id, 'approved', 'merge')}>Approve</button>
                                  <button className="btn-link" onClick={() => handleEditOpen(row)}>Edit</button>
                                  <button className="btn-danger" onClick={() => handleRowStatus(row.id, 'rejected')}>Reject</button>
                                </div>
                              ) : row.status === 'error' ? (
                                <div className="flex flex-wrap gap-1">
                                  <button className="btn-link" onClick={() => handleEditOpen(row)}>Edit</button>
                                  <button className="btn-link" onClick={() => handleRowStatus(row.id, 'pending')}>Retry</button>
                                </div>
                              ) : (
                                <button className="btn-link" onClick={() => handleRowStatus(row.id, 'pending')}>Reset</button>
                              )}
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-slate-50/70">
                              <td colSpan={11} className="px-5 py-4">
                                {note && (
                                  <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    {note}
                                  </div>
                                )}
                                <div className="grid gap-x-10 gap-y-5 md:grid-cols-2 lg:grid-cols-3">
                                  {FIELD_GROUPS.map(group => (
                                    <div key={group.label}>
                                      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</h4>
                                      <dl className="space-y-1 text-xs">
                                        {group.fields.map(f => {
                                          let val = m[f];
                                          if (f === 'vendorId') val = row.vendorName ?? val;
                                          if (f === 'typeId') val = row.typeName ?? val;
                                          return (
                                            <div key={f} className="flex gap-2">
                                              <dt className="w-28 shrink-0 text-slate-500">{labelFor(f)}</dt>
                                              <dd className="min-w-0 break-words text-slate-800">
                                                {val == null || val === '' ? <span className="text-slate-300">—</span>
                                                  : isUrl(val) ? <a href={String(val)} target="_blank" rel="noreferrer" className="break-all text-indigo-600 hover:underline">{String(val)}</a>
                                                  : f === 'costPerUom' ? fmtMoney(val)
                                                  : f === 'margin' ? fmtPct(val)
                                                  : f === 'description' ? asText(val)
                                                  : Array.isArray(val) ? fmtCell(val)
                                                  : fmtCell(val)}
                                              </dd>
                                            </div>
                                          );
                                        })}
                                      </dl>
                                    </div>
                                  ))}
                                </div>

                                {matchType === 'existing' && (
                                  <div className="mt-5 border-t border-slate-200 pt-4">
                                    <div className="mb-1.5 flex items-center justify-between">
                                      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Changes vs. existing</h4>
                                      <button className="btn-link text-xs" onClick={() => openCompare(row)}>Side-by-side →</button>
                                    </div>
                                    {hasDiff ? (
                                      <dl className="space-y-1 text-xs">
                                        {Object.entries(diff).map(([key, val]: any) => (
                                          <div key={key} className="flex items-center gap-2">
                                            <dt className="w-28 shrink-0 text-slate-500">{labelFor(key)}</dt>
                                            <dd className="flex flex-wrap items-center gap-1.5">
                                              <span className="text-slate-400 line-through">{asText(val?.old)}</span>
                                              <span className="text-slate-300">→</span>
                                              <span className="font-medium text-emerald-700">{asText(val?.new)}</span>
                                            </dd>
                                          </div>
                                        ))}
                                      </dl>
                                    ) : <p className="text-xs text-slate-400">No field changes.</p>}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                  <div className="text-xs text-slate-500">
                    Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="rounded border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" onClick={() => setEditModal(null)}>
          <div className="card !p-0 flex max-h-[82vh] w-full max-w-lg flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Edit row</h3>
              <button onClick={() => setEditModal(null)} className="btn-link">Close</button>
            </div>
            <div className="space-y-3 overflow-y-auto px-5 py-4">
              {ALL_FIELDS.map(key => {
                const val = editModal.mappedData[key];
                const isLong = key === 'description' || key === 'notes' || key === 'uses';
                const isArray = ['imageUrls', 'manufacturerUrls', 'submittalUrls', 'productInformationList', 'altProductList'].includes(key);
                return (
                  <div key={key}>
                    <label className="form-label">{labelFor(key)}</label>
                    {isLong ? (
                      <textarea
                        rows={key === 'description' ? 4 : 2}
                        value={val ?? ''}
                        onChange={e => {
                          const next = { ...editModal.mappedData };
                          const parsed = parseFieldValue(key, e.target.value);
                          if (parsed === null) delete next[key]; else next[key] = parsed;
                          setEditModal({ ...editModal, mappedData: next });
                        }}
                        className="form-input font-mono text-xs"
                      />
                    ) : isArray ? (
                      <input
                        type="text"
                        value={Array.isArray(val) ? val.join(', ') : val ?? ''}
                        onChange={e => {
                          const next = { ...editModal.mappedData };
                          const raw = e.target.value.trim();
                          if (raw) next[key] = raw.split(',').map(s => s.trim()).filter(Boolean);
                          else delete next[key];
                          setEditModal({ ...editModal, mappedData: next });
                        }}
                        className="form-input"
                        placeholder="comma separated values"
                      />
                    ) : (
                      <input
                        type="text"
                        value={val ?? ''}
                        onChange={e => {
                          const next = { ...editModal.mappedData };
                          const parsed = parseFieldValue(key, e.target.value);
                          if (parsed === null) delete next[key]; else next[key] = parsed;
                          setEditModal({ ...editModal, mappedData: next });
                        }}
                        className="form-input"
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button onClick={() => setEditModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleEditSave} className="btn-primary">Save</button>
            </div>
          </div>
        </div>
      )}

      {compare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" onClick={() => setCompare(null)}>
          <div className="card !p-0 flex max-h-[88vh] w-full max-w-3xl flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div className="flex items-baseline gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Compare</h3>
                <span className="font-mono text-xs text-slate-500">{compare.productCode ?? compare.rowId}</span>
                {compare.existingArchived && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">existing is archived</span>}
                {compare.partial && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">changed fields only (offline)</span>}
              </div>
              <button onClick={() => setCompare(null)} className="btn-link">Close</button>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-2 text-xs">
              <span className="text-slate-500">
                {compareLoading ? 'Loading…' : `${compare.changedCount ?? compare.fields.filter((f: any) => f.changed).length} changed of ${compare.fields.length} fields`}
              </span>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-1.5 text-slate-600">
                  <input type="checkbox" checked={onlyChanges} onChange={e => setOnlyChanges(e.target.checked)} />
                  Only changes
                </label>
                <button className="btn-link" onClick={() => setHtmlSource(s => !s)} title="Toggle HTML fields between rendered and source">
                  HTML: {htmlSource ? 'source' : 'rendered'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-[8rem_1fr_1fr] gap-px border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <div className="px-4 py-2">Field</div>
              <div className="px-4 py-2">Current</div>
              <div className="px-4 py-2">Incoming</div>
            </div>

            <div className="overflow-y-auto">
              {compareLoading && <p className="px-5 py-6 text-sm text-slate-400">Loading comparison…</p>}
              {!compareLoading && compare.fields.length === 0 && <p className="px-5 py-6 text-sm text-slate-400">No fields to compare.</p>}
              {!compareLoading && compare.fields
                .filter((f: any) => !onlyChanges || f.changed)
                .map((f: any) => (
                  <div key={f.field} className={`grid grid-cols-[8rem_1fr_1fr] gap-px border-b border-slate-100 ${f.changed ? 'bg-amber-50/60' : ''}`}>
                    <div className="px-4 py-2.5 text-xs text-slate-500">
                      {labelFor(f.field)}
                      {f.changed && <span className="ml-1 text-amber-500">●</span>}
                    </div>
                    <div className="px-4 py-2.5 text-xs text-slate-600">
                      <CompareValue field={f.field} value={f.current} isHtml={f.isHtml} htmlSource={htmlSource} muted={f.changed} />
                    </div>
                    <div className={`px-4 py-2.5 text-xs ${f.changed ? 'font-medium text-emerald-700' : 'text-slate-600'}`}>
                      <CompareValue field={f.field} value={f.incoming} isHtml={f.isHtml} htmlSource={htmlSource} />
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex justify-end border-t border-slate-200 px-5 py-3">
              <button onClick={() => setCompare(null)} className="btn-secondary">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CompareValue({
  field, value, isHtml, htmlSource, muted,
}: { field: string; value: any; isHtml: boolean; htmlSource: boolean; muted?: boolean }) {
  if (value == null || value === '') return <span className="text-slate-300">—</span>;

  if (Array.isArray(value)) {
    return <span className="break-words">{value.join(', ')}</span>;
  }

  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (isUrl(value)) {
    return <a href={String(value)} target="_blank" rel="noopener noreferrer" className="break-all text-sky-600 underline">{String(value)}</a>;
  }

  if (isHtml && typeof value === 'string') {
    if (htmlSource) {
      return <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-slate-500">{value}</pre>;
    }
    return (
      <div
        className={`prose prose-sm max-w-none [&_*]:my-0.5 ${muted ? 'opacity-70' : ''}`}
        dangerouslySetInnerHTML={{ __html: value }}
      />
    );
  }

  return <span className="break-words">{String(value)}</span>;
}
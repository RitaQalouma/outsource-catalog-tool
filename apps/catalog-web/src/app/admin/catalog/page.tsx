'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminApi } from '@/lib/api/adminClient';

// ---- types ---------------------------------------------------------
interface Product {
  id: string;
  productCode: string;
  normalizedCode: string;
  description: string | null;
  shopifyStatus: boolean;          // was active
  published: boolean;
  handle: string | null;
  imageUrls: string[] | null;
  manufacturerUrls: string[] | null;
  submittalUrls: string[] | null;
  productInformationList: any;
  altProductList: any;
  category: string | null;
  categoryDescription: string | null;
  uses: string | null;
  dateLastUpdated: string | null;
  costPerUom: number | null;
  uom: string;
  weightLbs: number | null;
  margin: number;
  caseQty: number | null;
  dimensions: string | null;
  notes: string | null;
  vendorId: string | null;
  typeId: string | null;
  archivedAt: string | null;
  vendorName?: string | null;
  typeName?: string | null;
  tags?: string | null; // comma‑separated names (aggregated)
  priceEach?: number | null;
}

interface ProductsResponse {
  items: Product[];
  total: number;
}

type StatusFilter = 'active' | 'inactive' | 'archived' | 'all';
const PAGE_SIZE = 50;

// ---- helpers ----------------------------------------------------------------
function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function parseMoney(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ---- columns ---------------------------------------------------------
const columns = [
  { key: 'expand', label: '' },
  { key: 'checkbox', label: '' },
  { key: 'productCode', label: 'Code' },
  { key: 'description', label: 'Description' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'costPerUom', label: 'Cost' },
  { key: 'margin', label: 'Margin' },
  { key: 'caseQty', label: 'Case' },
  { key: 'uom', label: 'UOM' },
  { key: 'dimensions', label: 'Dimensions' },
  { key: 'shopifyStatus', label: 'Shopify' }, // renamed from 'active'
  { key: 'published', label: 'Pub.' },
  { key: 'actions', label: 'Actions' },
];

// ---- icons (same as before) --------------------------------------------------
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14M12 5v14" />
  </svg>
);
const IconArchive = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect width="20" height="5" x="2" y="3" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" />
  </svg>
);
const IconRestore = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);
const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
const IconChevron = ({ expanded }: { expanded: boolean }) => (
  <svg
    className={`h-3 w-3 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <path d="M9 18l6-6-6-6" />
  </svg>
);

// ---- MultiSelect (unchanged) ------------------------------------------------
function MultiSelect({
  label,
  placeholder,
  options,
  selected,
  onChange,
  searchable = false,
  width = 'w-36',
}: {
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const toggle = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  const filtered =
    searchable && query.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
      : options;

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? '1 selected'
        : `${selected.length} selected`;

  return (
    <div className={cx('relative', width)} ref={ref}>
      <span className="form-label text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded border border-gray-300 bg-white px-2 py-1 text-left text-xs text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-200"
      >
        <span className={cx('truncate', selected.length === 0 && 'text-gray-500')}>{summary}</span>
        <svg
          className={cx('ml-1 h-3 w-3 shrink-0 text-gray-400 transition-transform', open && 'rotate-180')}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[12rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {searchable && (
            <div className="px-2 pb-1">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter…"
                className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
              />
            </div>
          )}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mb-1 w-full px-3 py-1 text-left text-[11px] font-medium text-indigo-600 hover:bg-indigo-50"
            >
              Clear selection
            </button>
          )}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No options</div>
            ) : (
              filtered.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1 text-xs hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    onChange={() => toggle(o.value)}
                    className="h-3.5 w-3.5 rounded border-gray-300 accent-indigo-600"
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- SearchChips (unchanged) ------------------------------------------------
function SearchChips({
  terms,
  setTerms,
  input,
  setInput,
  placeholder,
  width = 'w-80',
}: {
  terms: string[];
  setTerms: (next: string[]) => void;
  input: string;
  setInput: (next: string) => void;
  placeholder: string;
  width?: string;
}) {
  const commit = (raw: string) => {
    const t = raw.trim();
    if (t && !terms.includes(t)) setTerms([...terms, t]);
  };

  const handleChange = (val: string) => {
    if (val.includes(',')) {
      const parts = val.split(',');
      const last = parts.pop() ?? '';
      parts.forEach((p) => commit(p));
      setInput(last);
    } else {
      setInput(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(input);
      setInput('');
    } else if (e.key === 'Backspace' && input === '' && terms.length > 0) {
      setTerms(terms.slice(0, -1));
    }
  };

  return (
    <div className={width}>
      <span className="form-label text-[10px] uppercase tracking-wider text-gray-500">Search</span>
      <div className="flex flex-wrap items-center gap-1 rounded border border-gray-300 bg-white px-1.5 py-1 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-200">
        {terms.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="inline-flex items-center gap-1 rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700"
          >
            {t}
            <button
              type="button"
              onClick={() => setTerms(terms.filter((_, idx) => idx !== i))}
              className="leading-none text-indigo-400 hover:text-indigo-700"
              aria-label={`Remove ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={terms.length === 0 ? placeholder : 'Add term…'}
          className="min-w-[6rem] flex-1 border-0 bg-transparent p-0 text-xs focus:outline-none focus:ring-0"
        />
      </div>
    </div>
  );
}

// ---- ProductRow (updated) ----------------------------------------------------
function ProductRow({
  product,
  selectedIds,
  onSelect,
  costDrafts,
  onCostChange,
  onCostBlur,
  onCostKeyDown,
  onCaseQtyChange,
  onToggleShopifyStatus,
  onTogglePublished,
  onArchive,
  onRestore,
  saving,
}: {
  product: Product;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  costDrafts: Record<string, string>;
  onCostChange: (id: string, value: string) => void;
  onCostBlur: (product: Product) => void;
  onCostKeyDown: (e: React.KeyboardEvent, product: Product) => void;
  onCaseQtyChange: (product: Product, newQty: number) => void;
  onToggleShopifyStatus: (product: Product) => void;
  onTogglePublished: (product: Product) => void;
  onArchive: (product: Product) => void;
  onRestore: (product: Product) => void;
  saving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const archived = product.archivedAt != null;
  const isSelected = selectedIds.has(product.id);

  const descText = product.description ?? '';
  const displayDesc = descText.length > 80 ? descText.slice(0, 80) + '…' : descText || '—';

  return (
    <>
      <tr
        className={`table-row ${archived ? 'bg-gray-50/70 text-gray-400' : ''} ${saving ? 'opacity-60' : ''}`}
      >
        <td className="table-body-cell !px-1 text-center">
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded p-0.5 hover:bg-gray-200 focus:outline-none"
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
          >
            <IconChevron expanded={expanded} />
          </button>
        </td>
        <td className="table-body-cell !px-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(product.id)}
            className="h-3.5 w-3.5 rounded border-gray-300"
          />
        </td>
        <td className="table-body-cell !px-2 font-mono text-xs">
          <a href={`/admin/catalog/${product.id}`} className="text-indigo-600 hover:underline">
            {product.productCode}
          </a>
          {archived && <span className="ml-1 rounded bg-gray-200 px-1 py-0 text-[9px] font-semibold uppercase text-gray-600">Arch</span>}
        </td>
        <td className="table-body-cell !px-2 text-xs whitespace-normal break-words">{displayDesc}</td>
        <td className="table-body-cell !px-2 text-xs">{product.vendorName || product.vendorId || '—'}</td>
        <td className="table-body-cell !px-2">
          <div className="flex items-center gap-0.5">
            <span className="text-gray-400 text-xs">$</span>
            <input
              inputMode="decimal"
              value={costDrafts[product.id] ?? ''}
              disabled={archived || saving}
              onChange={(e) => onCostChange(product.id, e.target.value)}
              onBlur={() => onCostBlur(product)}
              onKeyDown={(e) => onCostKeyDown(e, product)}
              min="0"
              step="0.01"
              className="w-16 rounded border border-gray-300 bg-white px-1 py-0.5 text-right text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-200 disabled:bg-gray-100"
            />
          </div>
          {product.priceEach != null && (
            <div className="text-[9px] text-gray-400">each ${product.priceEach.toFixed(2)}</div>
          )}
        </td>
        <td className="table-body-cell !px-2 text-xs text-center">{product.margin}</td>
        <td className="table-body-cell !px-2">
          <input
            type="number"
            value={product.caseQty ?? 1}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val)) onCaseQtyChange(product, val);
            }}
            min="0"
            step="1"
            className="w-12 rounded border border-gray-300 px-1 py-0.5 text-right text-xs"
            disabled={archived || saving}
          />
        </td>
        <td className="table-body-cell !px-2 text-xs">{product.uom}</td>
        <td className="table-body-cell !px-2 text-xs text-center">{product.dimensions || '—'}</td>
        <td className="table-body-cell !px-2 text-center">
          <input
            type="checkbox"
            checked={product.shopifyStatus !== false}
            disabled={archived || saving}
            onChange={() => onToggleShopifyStatus(product)}
            className="h-3.5 w-3.5 cursor-pointer accent-indigo-600 disabled:cursor-not-allowed"
          />
        </td>
        <td className="table-body-cell !px-2 text-center">
          <input
            type="checkbox"
            checked={product.published === true}
            disabled={archived || saving}
            onChange={() => onTogglePublished(product)}
            className="h-3.5 w-3.5 cursor-pointer accent-indigo-600 disabled:cursor-not-allowed"
          />
        </td>
        <td className="table-body-cell !px-2 text-right">
          {archived ? (
            <button onClick={() => onRestore(product)} disabled={saving} className="btn-link text-xs inline-flex items-center gap-0.5">
              <IconRestore /> Restore
            </button>
          ) : (
            <button onClick={() => onArchive(product)} disabled={saving} className="btn-link text-xs inline-flex items-center gap-0.5 text-gray-500 hover:text-gray-700">
              <IconArchive /> Archive
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/80">
          <td colSpan={columns.length} className="px-3 py-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
              <div>
                <span className="font-medium text-gray-500">Handle</span> {product.handle || '—'}
              </div>
              <div>
                <span className="font-medium text-gray-500">Category</span> {product.category || '—'}
              </div>
              <div>
                <span className="font-medium text-gray-500">Type</span> {product.typeName || product.typeId || '—'}
              </div>
              <div>
                <span className="font-medium text-gray-500">Tags</span> {product.tags || '—'}
              </div>
              <div>
                <span className="font-medium text-gray-500">Weight (lbs)</span> {product.weightLbs ?? '—'}
              </div>
              <div>
                <span className="font-medium text-gray-500">Cat Desc</span> {product.categoryDescription || '—'}
              </div>
              <div className="col-span-2">
                <span className="font-medium text-gray-500">Product Info List</span>{' '}
                {product.productInformationList ? JSON.stringify(product.productInformationList) : '—'}
              </div>
              <div className="col-span-2">
                <span className="font-medium text-gray-500">Alternate Products</span>{' '}
                {product.altProductList ? JSON.stringify(product.altProductList) : '—'}
              </div>
              <div>
                <span className="font-medium text-gray-500">Image URLs</span>{' '}
                {product.imageUrls ? product.imageUrls.join(', ') : '—'}
              </div>
              <div>
                <span className="font-medium text-gray-500">Mfr URLs</span>{' '}
                {product.manufacturerUrls ? product.manufacturerUrls.join(', ') : '—'}
              </div>
              <div>
                <span className="font-medium text-gray-500">Submittal URLs</span>{' '}
                {product.submittalUrls ? product.submittalUrls.join(', ') : '—'}
              </div>
              <div className="col-span-2">
                <span className="font-medium text-gray-500">Notes</span> {product.notes || '—'}
              </div>
              <div>
                <span className="font-medium text-gray-500">Archived</span> {archived ? 'Yes' : 'No'}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// =============================================================================
export default function AccessoryCatalog() {
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusFilter>('active');
  const [page, setPage] = useState(0);

  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [productTypes, setProductTypes] = useState<{ id: string; name: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);

  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionModal, setBulkActionModal] = useState<{ action: string; title: string } | null>(null);

  const [bulkPercent, setBulkPercent] = useState('');
  const [bulkFixedCost, setBulkFixedCost] = useState('');
  const [bulkNewMargin, setBulkNewMargin] = useState('');
  const [recategorizeVendor, setRecategorizeVendor] = useState('');
  const [recategorizeType, setRecategorizeType] = useState('');
  const [recategorizeTags, setRecategorizeTags] = useState('');

  // Reset page + selection whenever a categorical filter changes.
  const onFilterChange = (setter: (v: string[]) => void) => (next: string[]) => {
    setter(next);
    setPage(0);
    setSelectedIds(new Set());
  };

  useEffect(() => {
    if (bulkActionModal) {
      setBulkPercent('');
      setBulkFixedCost('');
      setBulkNewMargin('');
      setRecategorizeVendor('');
      setRecategorizeType('');
      setRecategorizeTags('');
    }
  }, [bulkActionModal]);

  useEffect(() => {
    adminApi<any>('/vendors')
      .then(data => setVendors(Array.isArray(data) ? data : (data?.rows || data?.items || [])))
      .catch(() => setVendors([]));
    adminApi<any>('/product-types')
      .then(data => setProductTypes(Array.isArray(data) ? data : (data?.rows || data?.items || [])))
      .catch(() => setProductTypes([]));
    adminApi<any>('/tags')
      .then(data => setTags(Array.isArray(data) ? data : (data?.rows || data?.items || [])))
      .catch(() => setTags([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const combined = Array.from(new Set([...searchTerms, searchInput.trim()].filter(Boolean)));
      setDebouncedSearch(combined.join(','));
      setPage(0);
      setSelectedIds(new Set());
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerms, searchInput]);

  const includeArchived = status === 'archived' || status === 'all';

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (includeArchived) params.set('includeArchived', 'true');
      if (vendorFilter.length) params.set('vendorId', vendorFilter.join(','));
      if (typeFilter.length) params.set('typeId', typeFilter.join(','));
      if (tagFilter.length) params.set('tag', tagFilter.join(','));
      params.set('skip', String(page * PAGE_SIZE));
      params.set('take', String(PAGE_SIZE));
      const data = await adminApi<ProductsResponse>(`/products?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
      setCostDrafts(
        Object.fromEntries(
          data.items.map((p) => [p.id, p.costPerUom == null ? '' : String(p.costPerUom)]),
        ),
      );
      setSelectedIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, includeArchived, vendorFilter, typeFilter, tagFilter, page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const visible = useMemo(() => {
    return items.filter((p) => {
      const archived = p.archivedAt != null;
      const isActive = p.shopifyStatus !== false;
      if (status === 'active' && (archived || !isActive)) return false;
      if (status === 'inactive' && (archived || isActive)) return false;
      if (status === 'archived' && !archived) return false;
      return true;
    });
  }, [items, status]);

  const allVisibleIds = useMemo(() => new Set(visible.map(p => p.id)), [visible]);
  const allVisibleSelected = visible.length > 0 && visible.every(p => selectedIds.has(p.id));

  const toggleMasterCheckbox = () => {
    if (allVisibleSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        allVisibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => new Set([...prev, ...allVisibleIds]));
    }
  };

  const withSaving = async (id: string, fn: () => Promise<void>) => {
    setSavingIds((s) => new Set(s).add(id));
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
      await fetchProducts();
    } finally {
      setSavingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  };

  const patchRow = (id: string, patch: Partial<Product>) =>
    setItems((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const commitCost = (p: Product) =>
    withSaving(p.id, async () => {
      const draft = costDrafts[p.id] ?? '';
      const next = parseMoney(draft);
      if (next === p.costPerUom) return;
      patchRow(p.id, { costPerUom: next });
      const updated = await adminApi<Product>(`/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ costPerUom: next }),
      });
      patchRow(p.id, updated);
      setCostDrafts((d) => ({ ...d, [p.id]: updated.costPerUom == null ? '' : String(updated.costPerUom) }));
    });

  const handleCaseQtyChange = (p: Product, newQty: number) =>
    withSaving(p.id, async () => {
      await adminApi(`/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ caseQty: newQty }) });
      patchRow(p.id, { caseQty: newQty });
    });

  const toggleShopifyStatus = (p: Product) =>
    withSaving(p.id, async () => {
      const next = !(p.shopifyStatus !== false);
      patchRow(p.id, { shopifyStatus: next });
      const updated = await adminApi<Product>(`/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ shopifyStatus: next }),
      });
      patchRow(p.id, updated);
    });

  const togglePublished = (p: Product) =>
    withSaving(p.id, async () => {
      const nextPublished = !p.published;
      const body: Partial<Product> = { published: nextPublished };
      if (!nextPublished) body.shopifyStatus = false; // unpublish also deactivates
      await adminApi(`/products/${p.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      patchRow(p.id, body);
    });

  const archive = (p: Product) =>
    withSaving(p.id, async () => {
      await adminApi(`/products/${p.id}/archive`, { method: 'POST' });
      if (status === 'active' || status === 'inactive') {
        setItems((rows) => rows.filter((r) => r.id !== p.id));
        setTotal((t) => Math.max(0, t - 1));
      } else {
        patchRow(p.id, { archivedAt: new Date().toISOString() });
      }
    });

  const restore = (p: Product) =>
    withSaving(p.id, async () => {
      const updated = await adminApi<Product>(`/products/${p.id}/restore`, { method: 'POST' });
      patchRow(p.id, updated);
      if (status === 'archived') {
        setItems((rows) => rows.filter((r) => r.id !== p.id));
      }
    });

  const handleBulkAction = async (action: string, value?: any) => {
    if (selectedIds.size === 0 && action !== 'archiveByVendor') return;
    try {
      await adminApi('/products/bulk', {
        method: 'POST',
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          action,
          value,
          vendorId: action === 'archiveByVendor' ? value : undefined,
        }),
      });
      setSelectedIds(new Set());
      await fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk action failed');
    } finally {
      setBulkActionModal(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const vendorOptions = useMemo(() => vendors.map((v) => ({ value: v.id, label: v.name })), [vendors]);
  const typeOptions = useMemo(() => productTypes.map((t) => ({ value: t.id, label: t.name })), [productTypes]);
  const tagOptions = useMemo(() => tags.map((t) => ({ value: t.name, label: t.name })), [tags]);

  return (
    <div className="mx-auto max-w-full px-4 py-3 bg-gray-50 min-h-screen">
      {/* Header card */}
      <div className="mb-3 rounded-lg bg-white p-3 shadow-sm border border-gray-200/60">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-gray-800">Outsource Catalog</h1>
            <p className="text-xs text-gray-500">Edit cost, toggle active/published, bulk actions, export CSV.</p>
          </div>
        </div>
      </div>

      {/* Filters card */}
      <div className="mb-3 rounded-lg bg-white p-2 shadow-sm border border-gray-200/60">
        <div className="flex flex-wrap items-end gap-2">
          <SearchChips
            terms={searchTerms}
            setTerms={(next) => { setSearchTerms(next); setPage(0); setSelectedIds(new Set()); }}
            input={searchInput}
            setInput={setSearchInput}
            placeholder="Code or description…"
          />

          <MultiSelect
            label="Vendor"
            placeholder="All vendors"
            options={vendorOptions}
            selected={vendorFilter}
            onChange={onFilterChange(setVendorFilter)}
            searchable
          />

          <MultiSelect
            label="Type"
            placeholder="All types"
            options={typeOptions}
            selected={typeFilter}
            onChange={onFilterChange(setTypeFilter)}
          />

          <MultiSelect
            label="Tags"
            placeholder="All tags"
            options={tagOptions}
            selected={tagFilter}
            onChange={onFilterChange(setTagFilter)}
            searchable
          />

          <label className="w-28">
            <span className="form-label text-[10px] uppercase tracking-wider text-gray-500">Status</span>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(0); setSelectedIds(new Set()); }}
              className="form-select text-xs py-1"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </label>

          <button
            onClick={() => setShowAdd(true)}
            className="btn-primary gap-1 self-end text-xs py-1 px-2"
          >
            <IconPlus /> Add
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg bg-indigo-50/80 p-2 shadow-sm border border-indigo-100">
          <span className="mr-1 text-xs font-medium text-indigo-800">{selectedIds.size} selected</span>
          <button onClick={() => setBulkActionModal({ action: 'raiseCostPercent', title: 'Raise cost by %' })} className="btn-secondary text-indigo-700 border-indigo-200 hover:bg-indigo-100 text-xs py-0.5 px-2">+cost %</button>
          <button onClick={() => setBulkActionModal({ action: 'lowerCostPercent', title: 'Lower cost by %' })} className="btn-secondary text-indigo-700 border-indigo-200 hover:bg-indigo-100 text-xs py-0.5 px-2">−cost %</button>
          <button onClick={() => setBulkActionModal({ action: 'addFixedCost', title: 'Add fixed cost' })} className="btn-secondary text-indigo-700 border-indigo-200 hover:bg-indigo-100 text-xs py-0.5 px-2">+fixed</button>
          <button onClick={() => setBulkActionModal({ action: 'setMargin', title: 'Set margin %' })} className="btn-secondary text-indigo-700 border-indigo-200 hover:bg-indigo-100 text-xs py-0.5 px-2">Set margin</button>
          <button onClick={() => setBulkActionModal({ action: 'recategorize', title: 'Recategorize' })} className="btn-secondary text-indigo-700 border-indigo-200 hover:bg-indigo-100 text-xs py-0.5 px-2">Recategorize</button>
          <button onClick={() => handleBulkAction('setPublished', true)} className="btn-secondary text-indigo-700 border-indigo-200 hover:bg-indigo-100 text-xs py-0.5 px-2">Publish</button>
          <button onClick={() => handleBulkAction('setPublished', false)} className="btn-secondary text-indigo-700 border-indigo-200 hover:bg-indigo-100 text-xs py-0.5 px-2">Unpublish</button>
          <button onClick={() => handleBulkAction('archive')} className="btn-danger text-xs py-0.5 px-2">Archive</button>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto btn-link text-xs">Clear</button>
        </div>
      )}

      {vendorFilter.length === 1 && (
        <button
          onClick={() => {
            const vendorName = vendors.find(v => v.id === vendorFilter[0])?.name ?? 'this vendor';
            if (confirm(`Archive all active products from vendor "${vendorName}"?`))
              handleBulkAction('archiveByVendor', vendorFilter[0]);
          }}
          className="btn-danger text-xs mb-3 py-1 px-2"
        >
          Archive all from this vendor
        </button>
      )}

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm max-h-[calc(100vh-12rem)] overflow-y-auto">
        <table className="table-base w-full table-auto">
          <thead className="table-header">
            <tr>
              {columns.map((col) => {
                const isCheckbox = col.key === 'checkbox';
                const isExpand = col.key === 'expand';
                return (
                  <th
                    key={col.key}
                    className={cx(
                      'table-header-cell',
                      isExpand && '!px-1',
                      col.key === 'shopifyStatus' || col.key === 'published' ? 'text-center' : '',
                      col.key === 'actions' ? 'text-right' : ''
                    )}
                  >
                    {isCheckbox ? (
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleMasterCheckbox}
                        className="h-3.5 w-3.5 rounded border-white/40 accent-indigo-400 cursor-pointer"
                        aria-label="Select all rows"
                      />
                    ) : isExpand ? (
                      <span className="opacity-60 text-[10px]">▾</span>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="table-body">
            {loading ? (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-gray-400 text-sm">Loading catalog…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-gray-500 text-sm">No products match these filters.</td></tr>
            ) : (
              visible.map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  selectedIds={selectedIds}
                  onSelect={(id) => {
                    const newSet = new Set(selectedIds);
                    if (newSet.has(id)) newSet.delete(id);
                    else newSet.add(id);
                    setSelectedIds(newSet);
                  }}
                  costDrafts={costDrafts}
                  onCostChange={(id, value) => setCostDrafts((d) => ({ ...d, [id]: value }))}
                  onCostBlur={commitCost}
                  onCostKeyDown={(e, product) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') {
                      setCostDrafts((d) => ({ ...d, [product.id]: product.costPerUom == null ? '' : String(product.costPerUom) }));
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  onCaseQtyChange={handleCaseQtyChange}
                  onToggleShopifyStatus={toggleShopifyStatus}
                  onTogglePublished={togglePublished}
                  onArchive={archive}
                  onRestore={restore}
                  saving={savingIds.has(p.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>{total === 0 ? 'No products' : `Showing ${visible.length} of ${total}`}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || loading} className="btn-secondary text-xs py-1 px-2">Previous</button>
          <span className="tabular-nums">Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(p => p + 1 < totalPages ? p + 1 : p)} disabled={page + 1 >= totalPages || loading} className="btn-secondary text-xs py-1 px-2">Next</button>
        </div>
      </div>

      {/* Bulk modals */}
      {bulkActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={() => setBulkActionModal(null)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-800">{bulkActionModal.title}</h2>
              <button onClick={() => setBulkActionModal(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100"><IconClose /></button>
            </div>
            <div className="p-5 space-y-4">
              {(bulkActionModal.action === 'raiseCostPercent' || bulkActionModal.action === 'lowerCostPercent') && (
                <div>
                  <label className="form-label">Percent</label>
                  <input
                    type="number"
                    step="any"
                    value={bulkPercent}
                    onChange={e => setBulkPercent(e.target.value)}
                    min="0.01"
                    max="1000"
                    required
                    placeholder="e.g., 5"
                    className="form-input"
                  />
                </div>
              )}
              {bulkActionModal.action === 'addFixedCost' && (
                <div>
                  <label className="form-label">Amount to add</label>
                  <input type="number" step="any" value={bulkFixedCost} onChange={e => setBulkFixedCost(e.target.value)} placeholder="e.g., 2.50" className="form-input" />
                </div>
              )}
              {bulkActionModal.action === 'setMargin' && (
                <div>
                  <label className="form-label">New margin %</label>
                  <input type="number" step="any" value={bulkNewMargin} onChange={e => setBulkNewMargin(e.target.value)} placeholder="e.g., 30" className="form-input" />
                </div>
              )}
              {bulkActionModal.action === 'recategorize' && (
                <>
                  <div>
                    <label className="form-label">New Vendor (optional)</label>
                    <select value={recategorizeVendor} onChange={e => setRecategorizeVendor(e.target.value)} className="form-select">
                      <option value="">— Keep current —</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">New Type (optional)</label>
                    <select value={recategorizeType} onChange={e => setRecategorizeType(e.target.value)} className="form-select">
                      <option value="">— Keep current —</option>
                      {productTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Replace tags (comma separated)</label>
                    <input value={recategorizeTags} onChange={e => setRecategorizeTags(e.target.value)} placeholder="tag1, tag2" className="form-input" />
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button onClick={() => setBulkActionModal(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={async () => {
                  const action = bulkActionModal.action;
                  let value: any = undefined;
                  if (action === 'raiseCostPercent' || action === 'lowerCostPercent') {
                    value = parseFloat(bulkPercent);
                    if (isNaN(value)) return;
                  } else if (action === 'addFixedCost') {
                    value = parseFloat(bulkFixedCost);
                    if (isNaN(value)) return;
                  } else if (action === 'setMargin') {
                    value = parseFloat(bulkNewMargin);
                    if (isNaN(value)) return;
                  } else if (action === 'recategorize') {
                    value = {
                      vendor: recategorizeVendor || undefined,
                      type: recategorizeType || undefined,
                      tags: recategorizeTags ? recategorizeTags.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined,
                    };
                  }
                  await handleBulkAction(action, value);
                }}
                className="btn-primary"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <AddAccessoryModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); fetchProducts(); }}
          vendors={vendors}
          productTypes={productTypes}
          tags={tags}
        />
      )}
    </div>
  );
}

// ---- AddAccessoryModal (updated) -------------------------------------------
function AddAccessoryModal({
  onClose,
  onCreated,
  vendors,
  productTypes,
  tags,
}: {
  onClose: () => void;
  onCreated: () => void;
  vendors: { id: string; name: string }[];
  productTypes: { id: string; name: string }[];
  tags: { id: string; name: string }[];
}) {
  const [productCode, setProductCode] = useState('');
  const [normalizedCode, setNormalizedCode] = useState('');
  const [normalizedTouched, setNormalizedTouched] = useState(false);
  const [uom, setUom] = useState('');
  const [costPerUom, setCostPerUom] = useState('');
  const [margin, setMargin] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [caseQty, setCaseQty] = useState('');
  // New fields
  const [handle, setHandle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [uses, setUses] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [notes, setNotes] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [shopifyStatus, setShopifyStatus] = useState(true);
  const [published, setPublished] = useState(false);
  // Array fields (comma-separated for simplicity)
  const [imageUrls, setImageUrls] = useState('');
  const [manufacturerUrls, setManufacturerUrls] = useState('');
  const [submittalUrls, setSubmittalUrls] = useState('');
  const [productInformationList, setProductInformationList] = useState('');
  const [altProductList, setAltProductList] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => { firstField.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const effNormalized = normalizedTouched
    ? normalizedCode
    : productCode.trim().toLowerCase().replace(/\s+/g, '');

  const submit = async () => {
    setErr(null);
    if (!productCode.trim() || !effNormalized || !uom.trim()) {
      setErr('Code, normalized code, and UOM are required.');
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        productCode: productCode.trim(),
        normalizedCode: effNormalized,
        uom: uom.trim(),
        shopifyStatus,
        published,
      };
      if (handle.trim()) body.handle = handle.trim();
      if (description.trim()) body.description = description.trim();
      if (category.trim()) body.category = category.trim();
      if (categoryDescription.trim()) body.categoryDescription = categoryDescription.trim();
      if (uses.trim()) body.uses = uses.trim();
      if (dimensions.trim()) body.dimensions = dimensions.trim();
      if (notes.trim()) body.notes = notes.trim();
      if (imageUrls.trim()) body.imageUrls = imageUrls.split(',').map(s => s.trim()).filter(Boolean);
      if (manufacturerUrls.trim()) body.manufacturerUrls = manufacturerUrls.split(',').map(s => s.trim()).filter(Boolean);
      if (submittalUrls.trim()) body.submittalUrls = submittalUrls.split(',').map(s => s.trim()).filter(Boolean);
      if (productInformationList.trim()) body.productInformationList = productInformationList.split(',').map(s => s.trim()).filter(Boolean);
      if (altProductList.trim()) body.altProductList = altProductList.split(',').map(s => s.trim()).filter(Boolean);
      const c = parseMoney(costPerUom); if (c != null) body.costPerUom = c;
      const m = parseMoney(margin); if (m != null) body.margin = m;
      const w = parseMoney(weightLbs); if (w != null) body.weightLbs = w;
      const q = parseMoney(caseQty); if (q != null) body.caseQty = q;
      if (vendorId) body.vendorId = vendorId;
      if (typeId) body.typeId = typeId;
      if (tagsInput.trim()) {
        body.tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      }
      await adminApi<Product>('/products', { method: 'POST', body: JSON.stringify(body) });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the product.');
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-800">Add new product</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-5 py-5">
          <div className="space-y-3">
            <label><span className="form-label">Product Code *</span><input ref={firstField} value={productCode} onChange={e => setProductCode(e.target.value)} className={inputClass} /></label>
            <label><span className="form-label">Normalized Code *</span><input value={effNormalized} onChange={e => { setNormalizedTouched(true); setNormalizedCode(e.target.value); }} className={cx(inputClass, !normalizedTouched && 'text-gray-500')} /></label>
            <label><span className="form-label">UOM *</span><input value={uom} onChange={e => setUom(e.target.value)} placeholder="Stick, Tube, Each…" className={inputClass} /></label>
            <label><span className="form-label">Handle</span><input value={handle} onChange={e => setHandle(e.target.value)} className={inputClass} placeholder="auto-generated if left blank" /></label>
            <label><span className="form-label">Description</span><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={inputClass} /></label>
            <label><span className="form-label">Category (transition)</span><input value={category} onChange={e => setCategory(e.target.value)} className={inputClass} /></label>
            <label><span className="form-label">Category Description (transition)</span><input value={categoryDescription} onChange={e => setCategoryDescription(e.target.value)} className={inputClass} /></label>
          </div>
          <div className="space-y-3">
            <label><span className="form-label">Uses</span><input value={uses} onChange={e => setUses(e.target.value)} className={inputClass} /></label>
            <label><span className="form-label">Dimensions</span><input value={dimensions} onChange={e => setDimensions(e.target.value)} placeholder="e.g. 12×12×6" className={inputClass} /></label>
            <label><span className="form-label">Notes</span><input value={notes} onChange={e => setNotes(e.target.value)} className={inputClass} /></label>
            <label><span className="form-label">Vendor</span><select value={vendorId} onChange={e => setVendorId(e.target.value)} className={inputClass}><option value="">— None —</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
            <label><span className="form-label">Product Type</span><select value={typeId} onChange={e => setTypeId(e.target.value)} className={inputClass}><option value="">— None —</option>{productTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label><span className="form-label">Image URLs (comma)</span><input value={imageUrls} onChange={e => setImageUrls(e.target.value)} placeholder="url1, url2" className={inputClass} /></label>
            <label><span className="form-label">Manufacturer URLs (comma)</span><input value={manufacturerUrls} onChange={e => setManufacturerUrls(e.target.value)} placeholder="url1, url2" className={inputClass} /></label>
            <label><span className="form-label">Submittal URLs (comma)</span><input value={submittalUrls} onChange={e => setSubmittalUrls(e.target.value)} placeholder="url1, url2" className={inputClass} /></label>
            <label><span className="form-label">Product Info List (comma)</span><input value={productInformationList} onChange={e => setProductInformationList(e.target.value)} placeholder="item1, item2" className={inputClass} /></label>
            <label><span className="form-label">Alternate Products (comma)</span><input value={altProductList} onChange={e => setAltProductList(e.target.value)} placeholder="SKU1, SKU2" className={inputClass} /></label>
            <label><span className="form-label">Tags (comma)</span><input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="tag1, tag2" className={inputClass} /></label>
            <div className="flex gap-4 pt-1">
              <label className="flex items-center gap-2"><input type="checkbox" checked={shopifyStatus} onChange={e => setShopifyStatus(e.target.checked)} className="h-4 w-4 accent-indigo-600" /><span className="text-sm">Shopify Active</span></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} className="h-4 w-4 accent-indigo-600" /><span className="text-sm">Published</span></label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label><span className="form-label text-xs">Cost / UOM</span><input inputMode="decimal" value={costPerUom} onChange={e => setCostPerUom(e.target.value)} className={inputClass} /></label>
              <label><span className="form-label text-xs">Margin %</span><input inputMode="decimal" value={margin} onChange={e => setMargin(e.target.value)} className={inputClass} /></label>
              <label><span className="form-label text-xs">Case Qty</span><input inputMode="decimal" value={caseQty} onChange={e => setCaseQty(e.target.value)} className={inputClass} /></label>
              <label className="col-span-3"><span className="form-label text-xs">Weight (lbs)</span><input inputMode="decimal" value={weightLbs} onChange={e => setWeightLbs(e.target.value)} className={inputClass} /></label>
            </div>
          </div>
        </div>
        {err && <p className="px-5 pb-2 text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={submitting} className="btn-primary">{submitting ? 'Saving…' : 'Add product'}</button>
        </div>
      </div>
    </div>
  );
}
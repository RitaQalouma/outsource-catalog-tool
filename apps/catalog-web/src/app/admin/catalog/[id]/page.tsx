
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/api/adminClient';

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
  productInformationList: any;     // jsonb array
  altProductList: any;             // jsonb array
  category: string | null;         // kept for transition
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
}

export default function ProductEditPage() {
  const params = useParams();
  const id = params.id as string;
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [types, setTypes] = useState<{ id: string; name: string }[]>([]);
  const [allTags, setAllTags] = useState<{ id: string; name: string }[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const fetchProduct = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi<Product>(`/products/${id}`);
      setProduct(data);
      // load tags for this product
      const tagsRes = await adminApi<{ id: string; name: string }[]>(`/products/${id}/tags`);
      setSelectedTagIds(tagsRes.map(t => t.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load product');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchLookups = useCallback(async () => {
    try {
      const [v, t, tags] = await Promise.all([
        adminApi<any[]>('/vendors'),
        adminApi<any[]>('/product-types'),
        adminApi<any[]>('/tags'),
      ]);
      setVendors(Array.isArray(v) ? v : v?.rows ?? []);
      setTypes(Array.isArray(t) ? t : t?.rows ?? []);
      setAllTags(Array.isArray(tags) ? tags : tags?.rows ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchProduct();
    fetchLookups();
  }, [fetchProduct, fetchLookups]);

  const handleChange = (field: keyof Product, value: any) => {
    if (!product) return;
    setProduct({ ...product, [field]: value });
  };

  const handleSubmit = async () => {
    if (!product) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // Build update payload (exclude derived fields, tags)
      const payload: any = { ...product };
      delete payload.vendorName;
      delete payload.typeName;
      // Send product update
      await adminApi(`/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // Update tags
      await adminApi(`/products/${product.id}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tagIds: selectedTagIds }),
      });
      setSuccess('Product updated.');
      await fetchProduct();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-slate-500">Loading…</div>;
  if (error && !product) return <div className="p-6 text-red-600">{error}</div>;
  if (!product) return null;

  const priceEach = product.costPerUom != null && product.margin != null
    ? (product.costPerUom / (1 - product.margin / 100)).toFixed(2)
    : null;
  const casePrice = priceEach && product.caseQty
    ? (Number(priceEach) * product.caseQty).toFixed(2)
    : null;

  const inputClass =
    'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';
  const labelClass = 'block text-xs font-medium text-slate-500 mb-1';

  // Helper: URL list input
  const UrlListInput = ({
    value,
    onChange,
    placeholder,
  }: {
    value: string[] | null;
    onChange: (val: string[]) => void;
    placeholder?: string;
  }) => {
    const urls = value || [];
    const add = () => onChange([...urls, '']);
    const remove = (i: number) => onChange(urls.filter((_, idx) => idx !== i));
    const update = (i: number, val: string) => {
      const copy = [...urls];
      copy[i] = val;
      onChange(copy);
    };
    return (
      <div className="space-y-1">
        {urls.map((url, i) => (
          <div key={i} className="flex gap-1">
            <input
              type="url"
              value={url}
              onChange={(e) => update(i, e.target.value)}
              placeholder={placeholder || 'Enter URL'}
              className={`${inputClass} flex-1`}
            />
            <button type="button" onClick={() => remove(i)} className="text-red-500 hover:text-red-700">
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={add} className="text-xs text-indigo-600 hover:underline">
          + Add URL
        </button>
      </div>
    );
  };

  // Helper: string list input (for JSON arrays)
  const StringListInput = ({
    value,
    onChange,
    placeholder,
  }: {
    value: any;
    onChange: (val: string[]) => void;
    placeholder?: string;
  }) => {
    const list = Array.isArray(value) ? value : [];
    const add = () => onChange([...list, '']);
    const remove = (i: number) => onChange(list.filter((_, idx) => idx !== i));
    const update = (i: number, val: string) => {
      const copy = [...list];
      copy[i] = val;
      onChange(copy);
    };
    return (
      <div className="space-y-1">
        {list.map((item, i) => (
          <div key={i} className="flex gap-1">
            <input
              type="text"
              value={item}
              onChange={(e) => update(i, e.target.value)}
              placeholder={placeholder || 'Enter item'}
              className={`${inputClass} flex-1`}
            />
            <button type="button" onClick={() => remove(i)} className="text-red-500 hover:text-red-700">
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={add} className="text-xs text-indigo-600 hover:underline">
          + Add item
        </button>
      </div>
    );
  };

  // Tags multi-select
  const TagsPicker = () => (
    <div className="flex flex-wrap gap-2 mt-1">
      {allTags.map((tag) => (
        <label key={tag.id} className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={selectedTagIds.includes(tag.id)}
            onChange={() => {
              if (selectedTagIds.includes(tag.id)) {
                setSelectedTagIds(selectedTagIds.filter((id) => id !== tag.id));
              } else {
                setSelectedTagIds([...selectedTagIds, tag.id]);
              }
            }}
            className="h-4 w-4 accent-indigo-600"
          />
          {tag.name}
        </label>
      ))}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="heading-page text-base">Edit {product.productCode}</h1>
        <Link href="/admin/catalog" className="text-xs text-indigo-600 hover:underline">
          ← Back
        </Link>
      </div>
      {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}

      <div className="space-y-4">
        {/* Identity Card */}
        <div className="card !p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Identity</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Code</label>
              <input value={product.productCode} readOnly className={`${inputClass} bg-slate-100`} />
            </div>
            <div>
              <label className={labelClass}>Normalized Code</label>
              <input value={product.normalizedCode} readOnly className={`${inputClass} bg-slate-100`} />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Description</label>
              <textarea
                value={product.description ?? ''}
                onChange={(e) => handleChange('description', e.target.value || null)}
                rows={2}
                className={inputClass}
              />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Handle</label>
              <input
                value={product.handle ?? ''}
                onChange={(e) => handleChange('handle', e.target.value || null)}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Classification Card */}
        <div className="card !p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Classification</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                Vendor {product.vendorName && <span className="font-normal text-slate-400">(currently {product.vendorName})</span>}
              </label>
              <select
                value={product.vendorId ?? ''}
                onChange={(e) => handleChange('vendorId', e.target.value || null)}
                className={inputClass}
              >
                <option value="">None</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Product Type {product.typeName && <span className="font-normal text-slate-400">(currently {product.typeName})</span>}
              </label>
              <select
                value={product.typeId ?? ''}
                onChange={(e) => handleChange('typeId', e.target.value || null)}
                className={inputClass}
              >
                <option value="">None</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Category (transition)</label>
              <input
                value={product.category ?? ''}
                onChange={(e) => handleChange('category', e.target.value || null)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Category Description (transition)</label>
              <input
                value={product.categoryDescription ?? ''}
                onChange={(e) => handleChange('categoryDescription', e.target.value || null)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Uses</label>
              <input
                value={product.uses ?? ''}
                onChange={(e) => handleChange('uses', e.target.value || null)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Tags</label>
              <TagsPicker />
            </div>
          </div>
        </div>

        {/* Pricing & Logistics Card */}
        <div className="card !p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Pricing & Logistics</h2>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>Cost / UOM</label>
              <input
                type="number"
                step="any"
                value={product.costPerUom ?? ''}
                onChange={(e) => handleChange('costPerUom', e.target.value === '' ? null : parseFloat(e.target.value))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Margin %</label>
              <input
                type="number"
                step="any"
                value={product.margin ?? ''}
                onChange={(e) => handleChange('margin', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>UOM</label>
              <input
                value={product.uom ?? ''}
                onChange={(e) => handleChange('uom', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Case Qty</label>
              <input
                type="number"
                value={product.caseQty ?? ''}
                onChange={(e) => handleChange('caseQty', e.target.value === '' ? null : parseInt(e.target.value))}
                className={inputClass}
              />
            </div>
            <div className="col-span-4 flex gap-4 text-xs text-slate-500">
              <span>Price each: {priceEach ?? '—'}</span>
              <span>Case price: {casePrice ?? '—'}</span>
            </div>
            <div>
              <label className={labelClass}>Weight (lbs)</label>
              <input
                type="number"
                step="any"
                value={product.weightLbs ?? ''}
                onChange={(e) => handleChange('weightLbs', e.target.value === '' ? null : parseFloat(e.target.value))}
                className={inputClass}
              />
            </div>
            <div className="col-span-3">
              <label className={labelClass}>Dimensions</label>
              <input
                value={product.dimensions ?? ''}
                onChange={(e) => handleChange('dimensions', e.target.value || null)}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Product Information & Alternate Products */}
        <div className="card !p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Product Features & Alternatives</h2>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Product Information List (JSON array)</label>
              <StringListInput
                value={product.productInformationList || []}
                onChange={(list) => handleChange('productInformationList', list)}
                placeholder="e.g., ASTM Certified"
              />
            </div>
            <div>
              <label className={labelClass}>Alternate Products List (JSON array)</label>
              <StringListInput
                value={product.altProductList || []}
                onChange={(list) => handleChange('altProductList', list)}
                placeholder="e.g., ABC-123"
              />
            </div>
          </div>
        </div>

        {/* Links & Flags Card */}
        <div className="card !p-4">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Links & Flags</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Image URLs</label>
              <UrlListInput
                value={product.imageUrls}
                onChange={(urls) => handleChange('imageUrls', urls)}
                placeholder="https://example.com/image.jpg"
              />
            </div>
            <div>
              <label className={labelClass}>Manufacturer URLs</label>
              <UrlListInput
                value={product.manufacturerUrls}
                onChange={(urls) => handleChange('manufacturerUrls', urls)}
                placeholder="https://manufacturer.com/product"
              />
            </div>
            <div>
              <label className={labelClass}>Submittal URLs</label>
              <UrlListInput
                value={product.submittalUrls}
                onChange={(urls) => handleChange('submittalUrls', urls)}
                placeholder="https://submittal.com/doc"
              />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Notes</label>
              <textarea
                value={product.notes ?? ''}
                onChange={(e) => handleChange('notes', e.target.value || null)}
                rows={2}
                className={inputClass}
              />
            </div>
            <div className="flex items-center gap-4 col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={product.shopifyStatus}
                  onChange={(e) => handleChange('shopifyStatus', e.target.checked)}
                />{' '}
                Shopify Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={product.published}
                  onChange={(e) => handleChange('published', e.target.checked)}
                />{' '}
                Published (ready)
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Link href="/admin/catalog" className="btn-secondary">
          Cancel
        </Link>
        <button onClick={handleSubmit} disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
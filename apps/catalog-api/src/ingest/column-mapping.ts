// Catalog fields the CSV can map to, with how to coerce their values and the
// header synonyms used for smart auto-mapping.
export type FieldType = 'string' | 'number' | 'int';

export interface CatalogField {
  key: string;
  type: FieldType;
  synonyms: string[]; // already normalized (lowercase, alphanumeric only)
}

export const CATALOG_FIELDS: CatalogField[] = [
  { key: 'productCode',    type: 'string', synonyms: ['productcode', 'sku', 'itemnumber', 'partnumber', 'partno', 'item', 'code'] },
  { key: 'normalizedCode', type: 'string', synonyms: ['normalizedcode', 'normalized'] },
  { key: 'uom',            type: 'string', synonyms: ['uom', 'unit', 'unitofmeasure', 'units'] },
  { key: 'costPerUom',     type: 'number', synonyms: ['costperuom', 'cost', 'price', 'netprice', 'unitcost', 'unitprice', 'listprice'] },
  { key: 'weightLbs',      type: 'number', synonyms: ['weightlbs', 'weight', 'lbs', 'weightlb'] },
  { key: 'description',    type: 'string', synonyms: ['description', 'desc', 'name', 'productname', 'itemdescription'] },
  { key: 'caseQty',        type: 'int',    synonyms: ['caseqty', 'casequantity', 'qtypercase', 'pack', 'packsize', 'casepack'] },
  { key: 'margin',         type: 'number', synonyms: ['margin', 'grossmargin', 'markup'] },
  { key: 'category',       type: 'string', synonyms: ['category', 'type', 'group'] },
  { key: 'dimensions',     type: 'string', synonyms: ['dimensions', 'size', 'dims'] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Suggest { catalogField -> csvHeader } for each field we can confidently match.
export function suggestMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalized = headers.map((h) => ({ raw: h, n: norm(h) }));
  for (const field of CATALOG_FIELDS) {
    const hit = normalized.find((h) => field.synonyms.includes(h.n));
    if (hit) mapping[field.key] = hit.raw;
  }
  return mapping;
}

// NOTE: this normalization rule should match however the rest of the system
// derives normalizedCode. Adjust if Sales' pricing engine normalizes differently.
export function normalizeCode(productCode: string): string {
  return (productCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function coerce(type: FieldType, value: unknown): string | number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === '') return null;
  if (type === 'number') {
    const n = Number(s.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'int') {
    const n = parseInt(s.replace(/[^0-9\-]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }
  return s;
}

// Map a raw CSV row object to catalog fields using the column mapping.
export function mapRow(
  raw: Record<string, unknown>,
  mapping: Record<string, string>,
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const field of CATALOG_FIELDS) {
    const col = mapping[field.key];
    if (!col) continue;
    out[field.key] = coerce(field.type, raw[col]);
  }
  // derive normalizedCode from productCode if it wasn't explicitly mapped
  if (!out.normalizedCode && out.productCode) {
    out.normalizedCode = normalizeCode(String(out.productCode));
  }
  return out;
}
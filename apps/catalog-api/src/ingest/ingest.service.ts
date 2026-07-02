import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import * as crypto from 'crypto';
import * as Papa from 'papaparse';
import { AuditService } from '../audit/audit.service';

// ─── Field registry ────────────────────────────────────────────────
const ALLOWED_PRODUCT_COLUMNS = new Set([
  'productCode',
  'normalizedCode',
  'description',
  'category',              
  'uses',
  'dateLastUpdated',
  'costPerUom',
  'uom',
  'weightLbs',
  'margin',
  'caseQty',
  'dimensions',
  'notes',
  'vendorId',
  'typeId',
  'published',
  'shopifyStatus',
  'imageUrls',
  'manufacturerUrls',
  'submittalUrls',
  'handle',
  'productInformationList',
  'altProductList',
  'tags',
]);

const URL_COLUMNS = new Set([
  'imageUrls',
  'manufacturerUrls',
  'submittalUrls',
]);

const ARRAY_COLUMNS = new Set([
  'imageUrls',
  'manufacturerUrls',
  'submittalUrls',
]);

const JSON_COLUMNS = new Set([
  'productInformationList',
  'altProductList',
]);

const NUMERIC_COLUMNS = new Set([
  'costPerUom',
  'margin',
  'weightLbs',
  'caseQty',
]);

const BOOLEAN_COLUMNS = new Set([
  'published',
  'shopifyStatus',
]);

const REQUIRED_FOR_INSERT = new Set(['productCode', 'normalizedCode']);

const KNOWN_PREFIXES = ['R', 'Z'];
const KNOWN_PREFIX_RE = new RegExp(`^(?:${KNOWN_PREFIXES.join('|')})-`, 'i');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROW_STATUSES = ['pending', 'approved', 'rejected', 'committed', 'needs_review', 'error'] as const;
type RowStatus = (typeof ROW_STATUSES)[number];

export type Resolution = 'merge' | 'overwrite' | 'skip' | 'restore';

type SqlExecutor = { query: (text: string, params?: any[]) => Promise<any> };

interface RefField {
  field: 'vendorId' | 'typeId';
  table: 'catalog.vendors' | 'catalog.product_types';
  storeAs: 'name' | 'id';
}
const REF_FIELDS: RefField[] = [
  { field: 'vendorId', table: 'catalog.vendors', storeAs: 'id' },
  { field: 'typeId', table: 'catalog.product_types', storeAs: 'id' },
];

let sanitizeHtmlLib: ((dirty: string, opts?: any) => string) | null = null;
try { sanitizeHtmlLib = require('sanitize-html'); } catch { /* optional */ }

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(private db: DbService, private audit: AuditService) {}

  // ════════════════════════════════════════════════════════════════
  //  STEP 1+2: CSV intake → map → coerce → stage
  // ════════════════════════════════════════════════════════════════
  async ingestCsv(
    fileBuffer: Buffer,
    columnMap: Record<string, string>,
    opts: { source?: string; vendorId?: string } = {},
  ) {
    if (!columnMap || Object.keys(columnMap).length === 0) {
      throw new BadRequestException('A column mapping is required before staging');
    }

    const text = fileBuffer.toString('utf8');
    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    });

    if (parsed.errors?.length) {
      this.logger.warn(`CSV parse reported ${parsed.errors.length} issue(s); first: ${parsed.errors[0]?.message}`);
    }

    const mappedRows: Record<string, any>[] = [];
    for (const raw of parsed.data) {
      if (!raw || typeof raw !== 'object') continue;
      const mapped: Record<string, any> = {};
      let hasValue = false;
      for (const [csvHeader, field] of Object.entries(columnMap)) {
        if (!field || !ALLOWED_PRODUCT_COLUMNS.has(field)) continue;
        let coerced = this.coerce(field, (raw as any)[csvHeader]);
        if (coerced !== null && coerced !== undefined && coerced !== '') {
          mapped[field] = coerced;
          hasValue = true;
        }
      }
      if (opts.vendorId && !mapped.vendorId) mapped.vendorId = opts.vendorId;
      if (hasValue) mappedRows.push(mapped);
    }

    if (mappedRows.length === 0) {
      throw new BadRequestException('No usable rows after applying the column mapping');
    }

    return this.stageEnrichedRows(mappedRows, opts.source ?? 'csv');
  }

  private coerce(field: string, value: unknown): any {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (s === '') return null;

    if (ARRAY_COLUMNS.has(field)) {
      if (Array.isArray(value)) return value;
      return s.split(',').map(item => item.trim()).filter(Boolean);
    }

    if (JSON_COLUMNS.has(field)) {
      try {
        return JSON.parse(s);
      } catch {
        return s;
      }
    }

    if (NUMERIC_COLUMNS.has(field)) {
      const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
      return isNaN(n) ? null : n;
    }

    if (BOOLEAN_COLUMNS.has(field)) {
      const l = s.toLowerCase();
      return l === 'true' || l === '1' || l === 'yes' || l === 'active';
    }

    if (URL_COLUMNS.has(field)) {
      if (Array.isArray(value)) {
        return value.map(url => this.sanitizeUrl(url)).filter(Boolean);
      }
      return this.sanitizeUrl(s);
    }

    return s;
  }

  // ════════════════════════════════════════════════════════════════
  //  STEP 3+4+5: Stage rows, match against catalog, compute diffs
  // ════════════════════════════════════════════════════════════════
  async stageEnrichedRows(rows: Record<string, any>[], source = 'csv') {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('No rows to stage');
    }

    const batchId = crypto.randomUUID();
    const client = await this.db.pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO catalog.ingest_batches (id, source, status, "columnMapping")
         VALUES ($1, $2, 'open', '{}')`,
        [batchId, source],
      );

      for (const mapped of rows) {
        if (!mapped.normalizedCode && mapped.productCode) {
          mapped.normalizedCode = String(mapped.productCode).toUpperCase().replace(/\s+/g, '');
        }
      }

      await this.resolveAndCreateRefs(client, rows);

      const allProducts = await client.query(`SELECT * FROM catalog.products`);

      const exactByCode = new Map<string, any>();
      const exactByNorm = new Map<string, any>();
      const fallbackMap = new Map<string, any[]>();
      const productCodeIndex = new Map<string, { id: string; archived: boolean }>();

      for (const product of allProducts.rows) {
        const pcKey = this.codeKey(product.productCode);
        if (pcKey && !productCodeIndex.has(pcKey)) {
          productCodeIndex.set(pcKey, { id: product.id, archived: product.archivedAt != null });
        }
        if (product.archivedAt != null) continue;

        if (pcKey && !exactByCode.has(pcKey)) exactByCode.set(pcKey, product);

        const normKey = product.normalizedCode?.toLowerCase() ?? '';
        if (normKey && !exactByNorm.has(normKey)) exactByNorm.set(normKey, product);

        const fk = this.toMatchKey(product.productCode);
        if (fk) {
          const bucket = fallbackMap.get(fk);
          if (bucket) bucket.push(product);
          else fallbackMap.set(fk, [product]);
        }
      }

      const insertValues: string[] = [];
      const insertParams: any[] = [];
      const resolutions: (string | null)[] = [];
      let p = 1;

      for (const mapped of rows) {
        const normalizedCode = mapped.normalizedCode || null;
        const pcKey = this.codeKey(mapped.productCode);

        let matchedProductId: string | null = null;
        let diff: Record<string, any> | null = null;
        let status: RowStatus = 'pending';
        let resolution: string | null = null;
        let matched: any = null;

        if (pcKey && exactByCode.has(pcKey)) {
          matched = exactByCode.get(pcKey);
        } else if (normalizedCode && exactByNorm.has(normalizedCode.toLowerCase())) {
          matched = exactByNorm.get(normalizedCode.toLowerCase());
        } else if (pcKey) {
          const candidates = fallbackMap.get(this.toMatchKey(mapped.productCode)) ?? [];
          if (candidates.length === 1) {
            matched = candidates[0];
          } else if (candidates.length > 1) {
            status = 'needs_review';
            resolution = this.encodeAmbiguous(candidates.map((c) => c.id));
          }
        }

        if (matched) {
          matchedProductId = matched.id;
          diff = this.computeDiff(mapped, matched);
        } else if (status !== 'needs_review' && pcKey) {
          const collision = productCodeIndex.get(pcKey);
          if (collision) {
            status = 'needs_review';
            resolution =
              `productCode "${mapped.productCode}" already exists on product ${collision.id}` +
              `${collision.archived ? ' (archived)' : ''}; re-match or fix the code before committing.`;
          }
        }

        const rowId = crypto.randomUUID();
        insertValues.push(`($${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6})`);
        insertParams.push(
          rowId, batchId, JSON.stringify({}), JSON.stringify(mapped),
          matchedProductId, diff ? JSON.stringify(diff) : null, status,
        );
        resolutions.push(resolution);
        p += 7;
      }

      await client.query(
        `INSERT INTO catalog.ingest_rows
           (id, "batchId", "rawData", "mappedData", "matchedProductId", diff, status)
         VALUES ${insertValues.join(', ')}`,
        insertParams,
      );

      const inserted = await client.query(
        `SELECT id FROM catalog.ingest_rows WHERE "batchId" = $1 ORDER BY "createdAt" ASC`,
        [batchId],
      );
      for (let i = 0; i < inserted.rows.length && i < resolutions.length; i++) {
        if (resolutions[i] !== null) {
          await client.query(`UPDATE catalog.ingest_rows SET resolution = $1 WHERE id = $2`,
            [resolutions[i], inserted.rows[i].id]);
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error(`stageEnrichedRows failed for batch ${batchId}`, err as any);
      throw err;
    } finally {
      client.release();
    }

    return { batchId, rows: await this.getRows(batchId) };
  }

  private computeDiff(mapped: Record<string, any>, existing: Record<string, any>): Record<string, any> | null {
    const diffObj: Record<string, any> = {};
    for (const key of Object.keys(mapped)) {
      if (!ALLOWED_PRODUCT_COLUMNS.has(key)) continue;
      if (this.isBlank(mapped[key])) continue;
      if (!this.areValuesEqual(mapped[key], existing[key])) {
        diffObj[key] = { old: existing[key] ?? null, new: mapped[key] };
      }
    }
    return Object.keys(diffObj).length > 0 ? diffObj : null;
  }

  // ════════════════════════════════════════════════════════════════
  //  STEP 6+7: Review — status transitions & bulk ops
  // ════════════════════════════════════════════════════════════════
  async updateRowStatus(rowId: string, status: string, resolution?: string | null) {
    if (!ROW_STATUSES.includes(status as RowStatus)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }
    if (status === 'approved') {
      const cur = await this.db.pool.query(`SELECT resolution FROM catalog.ingest_rows WHERE id = $1`, [rowId]);
      if (cur.rows.length && this.decodeAmbiguous(cur.rows[0].resolution)) {
        throw new BadRequestException('Row has an unresolved ambiguous match; resolve it before approving');
      }
    }
    await this.db.pool.query(
      `UPDATE catalog.ingest_rows SET status = $1, resolution = $2 WHERE id = $3`,
      [status, resolution ?? null, rowId],
    );
  }

  async bulkUpdate(
    batchId: string,
    action: 'approve' | 'reject',
    rowIds: string[] | undefined,
    resolution?: string | null,
  ) {
    const status: RowStatus = action === 'approve' ? 'approved' : 'rejected';
    let where = `"batchId" = $1`;
    const params: any[] = [batchId];
    if (rowIds && rowIds.length) {
      params.push(rowIds);
      where += ` AND id = ANY($${params.length})`;
    }
    if (action === 'approve') {
      where += ` AND (resolution IS NULL OR resolution NOT LIKE '{"ambiguous"%')`;
    }
    let setClause = `status = '${status}'`;
    if (action === 'approve' && resolution) {
      params.push(resolution);
      setClause += `, resolution = $${params.length}`;
    }
    const res = await this.db.pool.query(
      `UPDATE catalog.ingest_rows SET ${setClause}
       WHERE ${where} AND status <> 'committed' RETURNING id`,
      params,
    );
    return { updated: res.rowCount };
  }

  async resolveAmbiguousRow(rowId: string, chosenProductId: string | null) {
    const rowRes = await this.db.pool.query(
      `SELECT id, "mappedData", resolution FROM catalog.ingest_rows WHERE id = $1`, [rowId]);
    if (rowRes.rows.length === 0) throw new BadRequestException('Row not found');
    const row = rowRes.rows[0];
    const candidates = this.decodeAmbiguous(row.resolution);

    if (chosenProductId !== null && candidates && !candidates.includes(chosenProductId)) {
      throw new BadRequestException(`Chosen product ${chosenProductId} is not one of the recorded candidates`);
    }

    let diff: Record<string, any> | null = null;
    if (chosenProductId) {
      const prod = await this.db.pool.query(
        `SELECT * FROM catalog.products WHERE id = $1 AND "archivedAt" IS NULL`, [chosenProductId]);
      if (prod.rows.length === 0) throw new BadRequestException('Chosen product no longer exists or is archived');
      diff = this.computeDiff(row.mappedData, prod.rows[0]);
    }

    await this.db.pool.query(
      `UPDATE catalog.ingest_rows
         SET "matchedProductId" = $1, diff = $2, resolution = NULL, status = 'pending'
       WHERE id = $3`,
      [chosenProductId, diff ? JSON.stringify(diff) : null, rowId],
    );
  }

  async updateMappedData(rowId: string, mappedData: any) {
    if (!mappedData || typeof mappedData !== 'object' || Array.isArray(mappedData)) {
      throw new BadRequestException('Invalid mappedData');
    }
    await this.db.pool.query(
      `UPDATE catalog.ingest_rows SET "mappedData" = $1 WHERE id = $2`,
      [JSON.stringify(mappedData), rowId],
    );
  }

  // ─── Listing ──────────────────────────────────────────────────────
  async getOpenBatches() {
    const res = await this.db.pool.query(
      `SELECT id, source, status, "createdAt",
              (SELECT count(*) FROM catalog.ingest_rows WHERE "batchId" = b.id) AS row_count
       FROM catalog.ingest_batches b WHERE status = 'open' ORDER BY "createdAt" DESC`,
    );
    return res.rows;
  }

  async getBatch(batchId: string) {
    const res = await this.db.pool.query(
      `SELECT b.id, b.source, b.status, b."createdAt",
              json_object_agg(s.status, s.cnt) FILTER (WHERE s.status IS NOT NULL) AS stats
       FROM catalog.ingest_batches b
       LEFT JOIN (
         SELECT "batchId", status, count(*)::int AS cnt
         FROM catalog.ingest_rows GROUP BY "batchId", status
       ) s ON s."batchId" = b.id
       WHERE b.id = $1
       GROUP BY b.id`,
      [batchId],
    );
    if (res.rows.length === 0) throw new BadRequestException('Batch not found');
    return res.rows[0];
  }

  async getRows(batchId: string) {
    const res = await this.db.pool.query(
      `SELECT ir.id, ir."rawData", ir."mappedData", ir.status,
              ir."matchedProductId", ir.resolution, ir.diff,
              ir."mappedData"->>'productCode' AS "productCode",
              v.name AS "vendorName",
              t.name AS "typeName",
              CASE
                WHEN ir.resolution LIKE '{"ambiguous"%' THEN 'possible_duplicate'
                WHEN ir."matchedProductId" IS NOT NULL  THEN 'existing'
                WHEN ir.status = 'needs_review'         THEN 'conflict'
                ELSE 'new'
              END AS "matchType"
       FROM catalog.ingest_rows ir
       LEFT JOIN catalog.vendors v ON v.id::text = ir."mappedData"->>'vendorId'
       LEFT JOIN catalog.product_types t ON t.id::text = ir."mappedData"->>'typeId'
       WHERE ir."batchId" = $1
       ORDER BY ir."createdAt" ASC`,
      [batchId],
    );
    return res.rows;
  }

  async deleteBatch(batchId: string) {
    await this.db.pool.query(`DELETE FROM catalog.ingest_rows WHERE "batchId" = $1`, [batchId]);
    await this.db.pool.query(`DELETE FROM catalog.ingest_batches WHERE id = $1`, [batchId]);
  }

  // ════════════════════════════════════════════════════════════════
  //  STEP 8: Commit — transactional, per-row savepoint isolation
  // ════════════════════════════════════════════════════════════════
  async commitBatch(batchId: string, authUid: string) {
    const client = await this.db.pool.connect();
    let committed = false;
    const result = { committed: 0, errors: 0, conflicts: 0, skipped: 0 };

    try {
      await client.query('BEGIN');

      const batchRes = await client.query(
        `SELECT id, status FROM catalog.ingest_batches WHERE id = $1 FOR UPDATE`, [batchId]);
      if (batchRes.rows.length === 0) throw new BadRequestException('Batch not found');
      if (batchRes.rows[0].status !== 'open') {
        throw new BadRequestException(`Batch is not open (status: ${batchRes.rows[0].status})`);
      }

      const rowsRes = await client.query(
        `SELECT id, "mappedData", status, "matchedProductId", resolution
         FROM catalog.ingest_rows WHERE "batchId" = $1 AND status = 'approved'`, [batchId]);
      if (rowsRes.rows.length === 0) throw new BadRequestException('No approved rows to commit');

      await this.resolveAndCreateRefs(client, rowsRes.rows.map((r: any) => r.mappedData));

      for (const row of rowsRes.rows) {
        await client.query('SAVEPOINT row_sp');
        try {
          await this.commitRow(client, row, result);
          await client.query('RELEASE SAVEPOINT row_sp');
        } catch (rowErr) {
          await client.query('ROLLBACK TO SAVEPOINT row_sp');
          result.errors++;
          await client.query(
            `UPDATE catalog.ingest_rows SET status = 'error', resolution = $1 WHERE id = $2`,
            [String((rowErr as any)?.message ?? rowErr).slice(0, 500), row.id],
          );
          this.logger.warn(`Row ${row.id} failed to commit: ${(rowErr as any)?.message}`);
        }
      }

      const remainingRes = await client.query(
        `SELECT COUNT(*) AS cnt FROM catalog.ingest_rows
         WHERE "batchId" = $1 AND status IN ('pending', 'approved', 'needs_review')`, [batchId]);
      if (parseInt(remainingRes.rows[0].cnt, 10) === 0) {
        await client.query(`UPDATE catalog.ingest_batches SET status = 'committed' WHERE id = $1`, [batchId]);
      }

      await client.query('COMMIT');
      committed = true;
    } catch (err) {
      if (!committed) await client.query('ROLLBACK');
      this.logger.error(`commitBatch failed for batch ${batchId}`, err as any);
      throw err;
    } finally {
      client.release();
    }

    try {
      await this.audit.log({
        actorId: authUid,
        action: `Committed ingest batch ${batchId}`,
        targetType: 'catalog.ingest_batches',
        targetId: batchId,
        beforeState: null,
        afterState: result,
        context: { module: 'ingest', source: 'csv' },
      });
    } catch (auditErr) {
      this.logger.error(`commitBatch ${batchId}: audit write failed (batch already committed)`, auditErr as any);
    }
    return result;
  }

  private async commitRow(client: SqlExecutor, row: any, result: any): Promise<void> {
    const mapped = row.mappedData;
    const safeData = this.buildSafeData(mapped);
    const existingId: string | null = row.matchedProductId;

    if (existingId) {
      const existing = await client.query(
        `SELECT * FROM catalog.products WHERE id = $1 AND "archivedAt" IS NULL`, [existingId]);
      const existingProduct = existing.rows[0];

      if (!existingProduct) {
        result.skipped++;
        await client.query(
          `UPDATE catalog.ingest_rows
             SET status = 'needs_review', "matchedProductId" = NULL, resolution = $1 WHERE id = $2`,
          ['matched product missing or archived at commit; re-match required', row.id]);
        return;
      }

      if (Object.keys(safeData).length === 0) {
        await client.query(`UPDATE catalog.ingest_rows SET status = 'committed' WHERE id = $1`, [row.id]);
        result.committed++;
        await this.handleTags(client, existingId, mapped.tags);
        return;
      }

      let resolution: Resolution = (row.resolution as Resolution) || 'merge';
      if (resolution !== 'overwrite' && resolution !== 'merge') resolution = 'merge';

      const keysToWrite =
        resolution === 'overwrite'
          ? Object.keys(safeData)
          : Object.keys(safeData).filter((k) => !this.areValuesEqual(safeData[k], existingProduct[k]));

      if (keysToWrite.length > 0) {
        const values = [...keysToWrite.map((k) => safeData[k]), existingId];
        const setClause = keysToWrite.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        await client.query(`UPDATE catalog.products SET ${setClause} WHERE id = $${values.length}`, values);
      }

      await this.handleTags(client, existingId, mapped.tags);
      await client.query(`UPDATE catalog.ingest_rows SET status = 'committed' WHERE id = $1`, [row.id]);
      result.committed++;
    } else {
      const missing = [...REQUIRED_FOR_INSERT].filter((c) => this.isBlank(safeData[c]));
      if (missing.length > 0) {
        result.skipped++;
        await client.query(
          `UPDATE catalog.ingest_rows SET status = 'needs_review', resolution = $1 WHERE id = $2`,
          [`missing required columns for new product: ${missing.join(', ')}`, row.id]);
        return;
      }

      const pcVal = this.codeKey(safeData['productCode']);
      if (pcVal) {
        const dup = await client.query(
          `SELECT id, "archivedAt" FROM catalog.products WHERE "productCode" = $1 LIMIT 1`, [pcVal]);
        if (dup.rows.length > 0) {
          result.conflicts++;
          const d = dup.rows[0];
          await client.query(
            `UPDATE catalog.ingest_rows SET status = 'needs_review', resolution = $1 WHERE id = $2`,
            [`productCode "${pcVal}" already exists on product ${d.id}${d.archivedAt != null ? ' (archived)' : ''}; re-match or fix the code`, row.id]);
          return;
        }
      }

      const id = crypto.randomUUID();
      const keys = Object.keys(safeData);
      const values = Object.values(safeData);
      const placeholders = values.map((_, i) => `$${i + 2}`).join(', ');
      await client.query(
        `INSERT INTO catalog.products (id, ${keys.map((k) => `"${k}"`).join(', ')})
         VALUES ($1, ${placeholders})`, [id, ...values]);

      await this.handleTags(client, id, mapped.tags);
      await client.query(`UPDATE catalog.ingest_rows SET status = 'committed' WHERE id = $1`, [row.id]);
      result.committed++;
    }
  }

  // ─── Tag handling ──────────────────────────────────────────────
  private async handleTags(client: SqlExecutor, productId: string, tagsInput: any): Promise<void> {
    if (!tagsInput) return;
    let tagNames: string[] = [];
    if (Array.isArray(tagsInput)) {
      tagNames = tagsInput.map(s => String(s).trim()).filter(Boolean);
    } else if (typeof tagsInput === 'string') {
      tagNames = tagsInput.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      return;
    }
    if (tagNames.length === 0) return;

    const tagIdMap = new Map<string, string>();
    for (const name of tagNames) {
      let res = await client.query(`SELECT id FROM catalog.tags WHERE tags_name = $1`, [name]);
      let tagId: string;
      if (res.rows.length === 0) {
        tagId = crypto.randomUUID();
        await client.query(
          `INSERT INTO catalog.tags (id, tags_name) VALUES ($1, $2) ON CONFLICT (tags_name) DO NOTHING`,
          [tagId, name]
        );
        res = await client.query(`SELECT id FROM catalog.tags WHERE tags_name = $1`, [name]);
        if (res.rows.length === 0) {
          continue;
        }
        tagId = res.rows[0].id;
      } else {
        tagId = res.rows[0].id;
      }
      tagIdMap.set(name, tagId);
    }

    await client.query(`DELETE FROM catalog.product_tags WHERE "productId" = $1`, [productId]);

    if (tagIdMap.size > 0) {
      const values = Array.from(tagIdMap.values()).map(tagId => `($1, '${tagId}')`).join(',');
      await client.query(
        `INSERT INTO catalog.product_tags ("productId", "tagId") VALUES ${values}`,
        [productId]
      );
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  Vendor / type reference resolver
  // ════════════════════════════════════════════════════════════════
  private async resolveAndCreateRefs(executor: SqlExecutor, mappedRows: Record<string, any>[]): Promise<void> {
    for (const ref of REF_FIELDS) await this.resolveRefField(executor, mappedRows, ref);
  }

  private async resolveRefField(
    executor: SqlExecutor, mappedRows: Record<string, any>[],
    { field, table, storeAs }: RefField,
  ): Promise<void> {
    const idByKey = new Map<string, string>();
    const nameByKey = new Map<string, string>();
    const nameById = new Map<string, string>();
    const knownIds = new Set<string>();

    const res = await executor.query(`SELECT id, name FROM ${table}`);
    for (const r of res.rows) {
      const k = this.normalizeKey(r.name);
      idByKey.set(k, r.id); nameByKey.set(k, r.name); nameById.set(r.id, r.name); knownIds.add(r.id);
    }
    const isResolvedId = (raw: string) => UUID_RE.test(raw) && knownIds.has(raw);

    const missingByKey = new Map<string, string>();
    for (const mapped of mappedRows) {
      const raw = this.coerceRef(mapped[field]);
      if (raw === null || isResolvedId(raw)) continue;
      const k = this.normalizeKey(raw);
      if (idByKey.has(k) || missingByKey.has(k)) continue;
      missingByKey.set(k, this.stripHtml(raw));
    }

    if (missingByKey.size > 0) {
      const names = Array.from(missingByKey.values());
      const vals: string[] = []; const params: any[] = []; let idx = 1;
      for (const name of names) { vals.push(`($${idx}, $${idx + 1})`); params.push(crypto.randomUUID(), name); idx += 2; }
      await executor.query(`INSERT INTO ${table} (id, name) VALUES ${vals.join(', ')} ON CONFLICT (name) DO NOTHING`, params);
      const reread = await executor.query(`SELECT id, name FROM ${table} WHERE name = ANY($1)`, [names]);
      for (const r of reread.rows) {
        const k = this.normalizeKey(r.name);
        idByKey.set(k, r.id); nameByKey.set(k, r.name); nameById.set(r.id, r.name); knownIds.add(r.id);
      }
    }

    for (const mapped of mappedRows) {
      const raw = this.coerceRef(mapped[field]);
      if (raw === null) { mapped[field] = null; continue; }
      const k = this.normalizeKey(raw);
      if (storeAs === 'name') mapped[field] = isResolvedId(raw) ? nameById.get(raw) ?? raw : nameByKey.get(k) ?? raw;
      else mapped[field] = isResolvedId(raw) ? raw : idByKey.get(k) ?? null;
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  Helpers
  // ════════════════════════════════════════════════════════════════
  private toMatchKey(code: string | null | undefined): string {
    if (!code) return '';
    return code.trim().toLowerCase().replace(KNOWN_PREFIX_RE, '');
  }
  private codeKey(code: unknown): string {
    if (code === null || code === undefined) return '';
    return String(code).trim();
  }
  private normalizeKey(s: unknown): string { return String(s ?? '').toLowerCase().trim(); }
  private coerceRef(raw: unknown): string | null {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    return s === '' ? null : s;
  }
  private isBlank(v: unknown): boolean { return v === null || v === undefined || v === ''; }

  private encodeAmbiguous(ids: string[]): string { return JSON.stringify({ ambiguous: ids }); }
  private decodeAmbiguous(resolution: string | null | undefined): string[] | null {
    if (!resolution) return null;
    try { const o = JSON.parse(resolution); return Array.isArray(o?.ambiguous) ? o.ambiguous : null; }
    catch { return null; }
  }

  private stripHtml(value: string): string { return value.replace(/<[^>]*>/g, '').trim(); }

  private sanitizeHtml(value: string): string {
    if (sanitizeHtmlLib) {
      return sanitizeHtmlLib(value, {
        allowedTags: ['p','h1','h2','h3','h4','ul','ol','li','b','i','strong','em','a','br','table','thead','tbody','tr','td','th','span','div'],
        allowedAttributes: { a: ['href','title','target','rel'], '*': ['style'] },
        allowedSchemes: ['http', 'https', 'mailto'],
      });
    }
    return value
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/ on\w+="[^"]*"/gi, '')
      .replace(/javascript:/gi, '');
  }

  private sanitizeUrl(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (s === '') return null;
    try { const u = new URL(s); return (u.protocol === 'http:' || u.protocol === 'https:') ? s : null; }
    catch { return null; }
  }

  static exportEscape(value: unknown): string {
    if (value === null || value === undefined) return '';
    const s = String(value);
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  }

  private areValuesEqual(a: any, b: any): boolean {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    if (typeof a === 'object' || typeof b === 'object') {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
    const aStr = String(a).trim();
    const bStr = String(b).trim();
    const numericLike = /^-?\d*\.?\d+$/;
    if (numericLike.test(aStr) && numericLike.test(bStr)) return parseFloat(aStr) === parseFloat(bStr);
    return aStr === bStr;
  }

  private buildSafeData(mapped: Record<string, any>): Record<string, any> {
    const safeData: Record<string, any> = {};
    for (const key of Object.keys(mapped)) {
      if (!ALLOWED_PRODUCT_COLUMNS.has(key)) continue;
      if (key === 'tags') continue;
      let val = mapped[key];
      if (URL_COLUMNS.has(key) && Array.isArray(val)) {
        val = val.map(url => this.sanitizeUrl(url)).filter(Boolean);
        if (val.length === 0) val = null;
      } else if (URL_COLUMNS.has(key) && typeof val === 'string') {
        val = this.sanitizeUrl(val);
      }
      if (this.isBlank(val)) continue;
      safeData[key] = val;
    }
    return safeData;
  }

  // ─── Get allowed columns for mapping UI ──────────────────────
  getAllowedColumns(): { field: string; type: string; description: string }[] {
    const typeMap: Record<string, string> = {
      productCode: 'text',
      normalizedCode: 'text',
      description: 'text',
      category: 'text',
      categoryDescription: 'text',
      uses: 'text',
      dateLastUpdated: 'timestamp',
      costPerUom: 'numeric',
      uom: 'text',
      weightLbs: 'numeric',
      margin: 'numeric',
      caseQty: 'integer',
      dimensions: 'text',
      notes: 'text',
      vendorId: 'text (UUID)',
      typeId: 'text (UUID)',
      published: 'boolean',
      shopifyStatus: 'boolean',
      imageUrls: 'text[] (comma‑separated)',
      manufacturerUrls: 'text[] (comma‑separated)',
      submittalUrls: 'text[] (comma‑separated)',
      handle: 'text',
      productInformationList: 'jsonb (comma‑separated)',
      altProductList: 'jsonb (comma‑separated)',
      tags: 'text[] (comma‑separated, handled separately)',
    };
    const result: { field: string; type: string; description: string }[] = [];
    for (const field of ALLOWED_PRODUCT_COLUMNS) {
      result.push({
        field,
        type: typeMap[field] || 'text',
        description: '',
      });
    }
    return result;
  }
}
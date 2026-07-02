// // import { Injectable } from '@nestjs/common';
// // import { DbService } from '../db/db.service';

// // @Injectable()
// // export class ExportService {
// //   constructor(private db: DbService) {}

// //   async generateShopifyCsv(includeAll: boolean, onlyUnpublished: boolean): Promise<string> {
// //     let query = `SELECT p.*, v.name AS "vendorName", pt.name AS "typeName"
// //                  FROM catalog.products p
// //                  LEFT JOIN catalog.vendors v ON p."vendorId" = v.id
// //                  LEFT JOIN catalog.product_types pt ON p."typeId" = pt.id`;
// //     const conditions: string[] = [];

// //     if (onlyUnpublished) {
// //       conditions.push(`p.published = false`);
// //       conditions.push(`p."archivedAt" IS NULL`);
// //     } else if (!includeAll) {
// //       // default – published only
// //       conditions.push(`p.published = true`);
// //       conditions.push(`p."archivedAt" IS NULL`);
// //     }
// //     // when includeAll is true, no conditions – export everything

// //     if (conditions.length > 0) {
// //       query += ' WHERE ' + conditions.join(' AND ');
// //     }

// //     const result = await this.db.pool.query(query);
// //     const rows = result.rows;

// //     const headers = [
// //       'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags',
// //       'Published', 'Option1 Name', 'Option1 Value', 'Variant SKU',
// //       'Variant Price', 'Variant Cost', 'Variant Inventory Qty',
// //       'Variant Weight',
// //     ];

// //     const csvLines = [headers.join(',')];

// //     for (const p of rows) {
// //       const handle = (p.productCode || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
// //       const title = p.title || p.description || p.productCode || '';
// //       const vendor = p.vendorName || p.vendorId || '';
// //       const type = p.typeName || p.typeId || '';
// //       const tags = p.commonNames || '';
// //       const published = p.published ? 'TRUE' : 'FALSE';
// //       const sellPrice =
// //         p.costPerUom != null
// //           ? (p.costPerUom / (1 - (p.margin || 0) / 100)).toFixed(2)
// //           : '';
// //       const cost = p.costPerUom != null ? p.costPerUom.toFixed(2) : '';
// //       const weight = p.weightLbs != null ? p.weightLbs.toString() : '';

// //       const line = [
// //         handle, title, '', vendor, type, tags, published,
// //         'Title', 'Default Title', p.productCode || '',
// //         sellPrice, cost, '', weight,
// //       ].map((field) => `"${(field || '').replace(/"/g, '""')}"`).join(',');

// //       csvLines.push(line);
// //     }

// //     return csvLines.join('\n');
// //   }
// // }
// import { Injectable } from '@nestjs/common';
// import { DbService } from '../db/db.service';

// @Injectable()
// export class ExportService {
//   constructor(private db: DbService) {}

//   async generateShopifyCsv(
//     includeAll: boolean,
//     onlyUnpublished: boolean,
//     onlyUpdated = false,
//   ): Promise<string> {
//     const conditions: string[] = [];
//     const params: any[] = [];

//     // Capture the cutoff BEFORE querying. If we instead advanced the marker to
//     // NOW() after building, any edit made during CSV generation would be missed
//     // next time. Storing the pre-query timestamp means a concurrent edit gets
//     // re-exported once — a duplicate, never a silent miss.
//     const exportStartedAt = new Date();

//     if (onlyUnpublished) {
//       conditions.push(`p.published = false`);
//       conditions.push(`p."archivedAt" IS NULL`);
//     } else if (onlyUpdated) {
//       // Incremental: published, non-archived products changed since last export.
//       const since = await this.getLastExportAt('shopify');
//       conditions.push(`p.published = true`);
//       conditions.push(`p."archivedAt" IS NULL`);
//       // First run (no marker yet) uses epoch → exports all published, which
//       // establishes the baseline for subsequent incremental runs.
//       params.push(since ?? new Date(0));
//       conditions.push(`p."updatedAt" > $${params.length}`);
//     } else if (!includeAll) {
//       // default – published only
//       conditions.push(`p.published = true`);
//       conditions.push(`p."archivedAt" IS NULL`);
//     }
//     // when includeAll is true, no conditions – export everything

//     let query = `SELECT p.*, v.name AS "vendorName", pt.name AS "typeName"
//                  FROM catalog.products p
//                  LEFT JOIN catalog.vendors v ON p."vendorId" = v.id
//                  LEFT JOIN catalog.product_types pt ON p."typeId" = pt.id`;

//     if (conditions.length > 0) {
//       query += ' WHERE ' + conditions.join(' AND ');
//     }
//     query += ` ORDER BY p."updatedAt" DESC`;

//     const result = await this.db.pool.query(query, params);
//     const rows = result.rows;

//     const headers = [
//       'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags',
//       'Published', 'Option1 Name', 'Option1 Value', 'Variant SKU',
//       'Variant Price', 'Variant Cost', 'Variant Inventory Qty',
//       'Variant Weight',
//     ];

//     const csvLines = [headers.join(',')];

//     for (const p of rows) {
//       const handle = (p.productCode || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
//       const title = p.title || p.description || p.productCode || '';
//       const vendor = p.vendorName || p.vendorId || '';
//       const type = p.typeName || p.typeId || '';
//       const tags = p.commonNames || '';
//       const published = p.published ? 'TRUE' : 'FALSE';
//       const sellPrice =
//         p.costPerUom != null
//           ? (p.costPerUom / (1 - (p.margin || 0) / 100)).toFixed(2)
//           : '';
//       const cost = p.costPerUom != null ? p.costPerUom.toFixed(2) : '';
//       const weight = p.weightLbs != null ? p.weightLbs.toString() : '';

//       const line = [
//         handle, title, '', vendor, type, tags, published,
//         'Title', 'Default Title', p.productCode || '',
//         sellPrice, cost, '', weight,
//       ].map((field) => `"${(field || '').replace(/"/g, '""')}"`).join(',');

//       csvLines.push(line);
//     }

//     const csv = csvLines.join('\n');

//     // Advance the marker only for the incremental mode, and only now that the
//     // CSV has been built without throwing.
//     if (onlyUpdated) {
//       await this.db.pool.query(
//         `INSERT INTO catalog.export_state (export_type, last_exported_at)
//          VALUES ('shopify', $1)
//          ON CONFLICT (export_type) DO UPDATE SET last_exported_at = EXCLUDED.last_exported_at`,
//         [exportStartedAt],
//       );
//     }

//     return csv;
//   }

//   private async getLastExportAt(type: string): Promise<Date | null> {
//     const res = await this.db.pool.query(
//       `SELECT last_exported_at FROM catalog.export_state WHERE export_type = $1`,
//       [type],
//     );
//     return res.rows[0]?.last_exported_at ?? null;
//   }
// }// apps/catalog-api/src/export/export.service.ts
import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Injectable()
export class ExportService {
  constructor(private db: DbService) {}

  // ─── Existing Shopify Export ─────────────────────────────
  async generateShopifyCsv(
    includeAll: boolean,
    onlyUnpublished: boolean,
    onlyUpdated = false,
  ): Promise<string> {
    const conditions: string[] = [];
    const params: any[] = [];

    const exportStartedAt = new Date();

    if (onlyUnpublished) {
      conditions.push(`p.published = false`);
      conditions.push(`p."archivedAt" IS NULL`);
    } else if (onlyUpdated) {
      const since = await this.getLastExportAt('shopify');
      conditions.push(`p.published = true`);
      conditions.push(`p."archivedAt" IS NULL`);
      params.push(since ?? new Date(0));
      conditions.push(`p."updatedAt" > $${params.length}`);
    } else if (!includeAll) {
      conditions.push(`p.published = true`);
      conditions.push(`p."archivedAt" IS NULL`);
    }

    let query = `
      SELECT 
        p.*,
        v.name AS "vendorName",
        pt.name AS "typeName",
        array_to_string(array_agg(DISTINCT t.tags_name), ',') AS "tagNames"
      FROM catalog.products p
      LEFT JOIN catalog.vendors v ON p."vendorId" = v.id
      LEFT JOIN catalog.product_types pt ON p."typeId" = pt.id
      LEFT JOIN catalog.product_tags ptg ON p.id = ptg."productId"
      LEFT JOIN catalog.tags t ON ptg."tagId" = t.id
    `;

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ` GROUP BY p.id, v.name, pt.name ORDER BY p."updatedAt" DESC`;

    const result = await this.db.pool.query(query, params);
    const rows = result.rows;

    const headers = [
      'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags',
      'Published', 'Option1 Name', 'Option1 Value', 'Variant SKU',
      'Variant Price', 'Variant Cost', 'Variant Inventory Qty',
      'Variant Weight',
    ];

    const csvLines = [headers.join(',')];

    for (const p of rows) {
      let handle = p.handle;
      if (!handle) {
        handle = (p.productCode || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        handle = handle.replace(/^-+|-+$/g, '');
      }

      const title = p.title || p.description || p.productCode || '';
      const dimensions = p.dimensions || '';
      const fullTitle = [p.vendorName, title, dimensions].filter(Boolean).join(' ');

      const vendor = p.vendorName || p.vendorId || '';
      const type = p.typeName || p.typeId || '';
      const tags = p.tagNames || '';
      const published = p.published ? 'TRUE' : 'FALSE';
      const sellPrice =
        p.costPerUom != null
          ? (p.costPerUom / (1 - (p.margin || 0) / 100)).toFixed(2)
          : '';
      const cost = p.costPerUom != null ? p.costPerUom.toFixed(2) : '';
      const weight = p.weightLbs != null ? p.weightLbs.toString() : '';

      const line = [
        handle,
        fullTitle,
        '', // Body HTML – can be generated later
        vendor,
        type,
        tags,
        published,
        'Title',
        'Default Title',
        p.productCode || '',
        sellPrice,
        cost,
        '',
        weight,
      ].map((field) => `"${(field || '').replace(/"/g, '""')}"`).join(',');

      csvLines.push(line);
    }

    const csv = csvLines.join('\n');

    if (onlyUpdated) {
      await this.db.pool.query(
        `INSERT INTO catalog.export_state (export_type, last_exported_at)
         VALUES ('shopify', $1)
         ON CONFLICT (export_type) DO UPDATE SET last_exported_at = EXCLUDED.last_exported_at`,
        [exportStartedAt],
      );
    }

    return csv;
  }

  private async getLastExportAt(type: string): Promise<Date | null> {
    const res = await this.db.pool.query(
      `SELECT last_exported_at FROM catalog.export_state WHERE export_type = $1`,
      [type],
    );
    return res.rows[0]?.last_exported_at ?? null;
  }

  // ─── NEW: Full Catalog Export ─────────────────────────────
  async generateCatalogCsv(): Promise<string> {
    const query = `
      SELECT
        p."productCode",
        p."normalizedCode",
        p."description",
        p."category",
        p."uses",
        p."dateLastUpdated",
        p."costPerUom",
        p."uom",
        p."weightLbs",
        p."margin",
        p."caseQty",
        p."dimensions",
        p."notes",
        p."shopifyStatus",
        p."published",
        p."archivedAt",
        p."handle",
        p."productInformationList",
        p."altProductList",
        p."createdAt",
        p."updatedAt",
        v.name AS "vendorName",
        pt.name AS "typeName",
        array_to_string(array_agg(DISTINCT t.tags_name), ', ') AS "tags"
      FROM catalog.products p
      LEFT JOIN catalog.vendors v ON p."vendorId" = v.id
      LEFT JOIN catalog.product_types pt ON p."typeId" = pt.id
      LEFT JOIN catalog.product_tags ptg ON p.id = ptg."productId"
      LEFT JOIN catalog.tags t ON ptg."tagId" = t.id
      GROUP BY p.id, v.name, pt.name
      ORDER BY p."productCode"
    `;

    const result = await this.db.pool.query(query);
    const rows = result.rows;

    if (rows.length === 0) return '';

    const headers = [
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
      'shopifyStatus',
      'published',
      'archivedAt',
      'handle',
      'productInformationList',
      'altProductList',
      'vendorName',
      'typeName',
      'tags',
      'createdAt',
      'updatedAt',
    ];

    const escape = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      let s = String(val);
      if (Array.isArray(val)) {
        s = val.join(', ');
      } else if (typeof val === 'object') {
        s = JSON.stringify(val);
      }
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        s = `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const csvLines: string[] = [];
    csvLines.push(headers.map(h => escape(h)).join(','));

    for (const row of rows) {
      const line = headers.map((h) => {
        const val = row[h];
        return escape(val);
      });
      csvLines.push(line.join(','));
    }

    return csvLines.join('\n');
  }
}
// // apps/catalog-api/src/export/export.controller.ts
// import {
//   Controller,
//   Get,
//   Res,
//   Query,
//   BadRequestException,
// } from '@nestjs/common';
// import { DbService } from '../db/db.service';
// import type { Response } from 'express';
// import { Roles } from '../auth/roles.decorator';

// @Controller('export')
// @Roles('admin')
// export class ExportController {
//   constructor(private db: DbService) {}

//   /** Neutralise CSV/formula injection payloads */
//   private sanitizeFormula(value: unknown): string {
//     if (value === null || value === undefined) return '';
//     let s = String(value).trim();
//     if (/^[=+\-@]/.test(s)) {
//       s = "'" + s;
//     }
//     return s;
//   }

//   /** Escape a single CSV field */
//   private csvField(value: unknown): string {
//     const s = this.sanitizeFormula(value);
//     if (s.includes(',') || s.includes('"') || s.includes('\n')) {
//       return `"${s.replace(/"/g, '""')}"`;
//     }
//     return s;
//   }

//   @Get('shopify')
//   async exportShopify(
//     @Query('publishedOnly') publishedOnly: string,
//     @Query('unpublishedOnly') unpublishedOnly: string,
//     @Query('all') all: string,
//     @Res() res: Response,
//   ) {
//     const includeAll = all === 'true';
//     const includeUnpublishedOnly = unpublishedOnly === 'true';

//     const conditions: string[] = [];

//     if (includeAll) {
//       // no filters – export everything
//     } else if (includeUnpublishedOnly) {
//       conditions.push('p.published = false');
//       conditions.push('p."archivedAt" IS NULL');
//     } else {
//       // default: published only
//       conditions.push('p.published = true');
//       conditions.push('p."archivedAt" IS NULL');
//     }

//     const whereClause =
//       conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

//     const query = `
//       SELECT
//         p."productCode" AS handle,
//         COALESCE(p.title, p.description, '') AS title,
//         COALESCE(v.name, '') AS vendor,
//         COALESCE(pt.name, '') AS product_type,
//         array_to_string(array_agg(DISTINCT t.name), ',') AS tags,
//         p.published,
//         p."costPerUom",
//         p.margin,
//         p.uom,
//         p."weightLbs",
//         p."imageUrl",
//         p."manufacturerUrl",
//         p."submittalUrl",
//         p."caseQty"
//       FROM catalog.products p
//       LEFT JOIN catalog.vendors v ON p."vendorId" = v.id
//       LEFT JOIN catalog.product_types pt ON p."typeId" = pt.id
//       LEFT JOIN catalog.product_tags ptg ON p.id = ptg."productId"
//       LEFT JOIN catalog.tags t ON ptg."tagId" = t.id
//       ${whereClause}
//       GROUP BY p.id, v.name, pt.name
//       ORDER BY p."productCode"
//     `;

//     const result = await this.db.pool.query(query);
//     const rows = result.rows;

//     if (rows.length === 0) {
//       res.setHeader('Content-Type', 'text/csv');
//       res.setHeader(
//         'Content-Disposition',
//         'attachment; filename="shopify_export.csv"',
//       );
//       return res.send('');
//     }

//     // CSV header
//     const headers = [
//       'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags',
//       'Published', 'Option1 Name', 'Option1 Value', 'Variant SKU',
//       'Variant Price', 'Variant Cost', 'Variant Inventory Qty',
//       'Variant Weight', 'Variant Grams', 'Variant Weight Unit',
//       'Image Src', 'Image Alt Text', 'Cost per item',
//     ];
//     const csvLines = [headers.map(h => this.csvField(h)).join(',')];

//     for (const row of rows) {
//       const cost = row.costPerUom ? parseFloat(row.costPerUom) : null;
//       const margin = row.margin ? parseFloat(row.margin) : 0;
//       const sellPrice =
//         cost != null && margin < 100
//           ? (cost / (1 - margin / 100)).toFixed(2)
//           : '';

//       const line = [
//         row.handle,
//         row.title,
//         '',                                          // Body HTML
//         row.vendor,
//         row.product_type,
//         row.tags || '',
//         row.published ? 'true' : 'false',
//         'Title',
//         row.title,
//         row.handle,
//         sellPrice,
//         cost != null ? cost.toFixed(2) : '',
//         '',                                          // inventory qty
//         row.weightLbs != null ? row.weightLbs.toString() : '',
//         row.weightLbs != null ? Math.round(row.weightLbs * 453.592).toString() : '',
//         'lb',
//         row.imageUrl || '',
//         row.title,
//         cost != null ? cost.toFixed(2) : '',
//       ].map(v => this.csvField(v));

//       csvLines.push(line.join(','));
//     }

//     res.setHeader('Content-Type', 'text/csv');
//     res.setHeader(
//       'Content-Disposition',
//       `attachment; filename="shopify-catalog-${new Date().toISOString().split('T')[0]}.csv"`,
//     );
//     res.send(csvLines.join('\n'));
//   }
// }// apps/catalog-api/src/export/export.controller.ts
// apps/catalog-api/src/export/export.controller.ts
import {
  Controller,
  Get,
  Res,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import type { Response } from 'express';
import { Roles } from '../auth/roles.decorator';

@Controller('export')
@Roles('admin')
export class ExportController {
  constructor(private db: DbService) {}

  /** Neutralise CSV/formula injection payloads */
  private sanitizeFormula(value: unknown): string {
    if (value === null || value === undefined) return '';
    let s = String(value).trim();
    if (/^[=+\-@]/.test(s)) {
      s = "'" + s;
    }
    return s;
  }

  /** Escape a single CSV field */
  private csvField(value: unknown): string {
    const s = this.sanitizeFormula(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  @Get('shopify')
  async exportShopify(
    @Query('publishedOnly') publishedOnly: string,
    @Query('unpublishedOnly') unpublishedOnly: string,
    @Query('all') all: string,
    @Res() res: Response,
  ) {
    const includeAll = all === 'true';
    const includeUnpublishedOnly = unpublishedOnly === 'true';

    const conditions: string[] = [];

    if (includeAll) {
      // no filters – export everything
    } else if (includeUnpublishedOnly) {
      conditions.push('p.published = false');
      conditions.push('p."archivedAt" IS NULL');
    } else {
      // default: published only
      conditions.push('p.published = true');
      conditions.push('p."archivedAt" IS NULL');
    }

    const whereClause =
      conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

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
        p."imageUrls",
        p."manufacturerUrls",
        p."submittalUrls",
        v.name AS "vendorName",
        pt.name AS "typeName",
        array_to_string(array_agg(DISTINCT t.tags_name), ', ') AS "tags"
      FROM catalog.products p
      LEFT JOIN catalog.vendors v ON p."vendorId" = v.id
      LEFT JOIN catalog.product_types pt ON p."typeId" = pt.id
      LEFT JOIN catalog.product_tags ptg ON p.id = ptg."productId"
      LEFT JOIN catalog.tags t ON ptg."tagId" = t.id
      ${whereClause}
      GROUP BY p.id, v.name, pt.name
      ORDER BY p."productCode"
    `;

    const result = await this.db.pool.query(query);
    const rows = result.rows;

    if (rows.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="catalog_export.csv"',
      );
      return res.send('');
    }

    // CSV header – matches catalog table field names (as you requested)
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
      'imageUrls',
      'manufacturerUrls',
      'submittalUrls',
      'vendorName',
      'typeName',
      'tags',
      'createdAt',
      'updatedAt',
    ];

    const csvLines = [headers.map(h => this.csvField(h)).join(',')];

    for (const row of rows) {
      const formatArray = (val: any) => {
        if (!val) return '';
        if (Array.isArray(val)) return val.join(', ');
        return String(val);
      };

      const line = [
        row.productCode || '',
        row.normalizedCode || '',
        row.description || '',
        row.category || '',
        row.uses || '',
        row.dateLastUpdated || '',
        row.costPerUom ?? '',
        row.uom || '',
        row.weightLbs ?? '',
        row.margin ?? '',
        row.caseQty ?? '',
        row.dimensions || '',
        row.notes || '',
        row.shopifyStatus ? 'true' : 'false',
        row.published ? 'true' : 'false',
        row.archivedAt || '',
        row.handle || '',
        row.productInformationList ? (Array.isArray(row.productInformationList) ? row.productInformationList.join(', ') : JSON.stringify(row.productInformationList)) : '',
        row.altProductList ? (Array.isArray(row.altProductList) ? row.altProductList.join(', ') : JSON.stringify(row.altProductList)) : '',
        formatArray(row.imageUrls),
        formatArray(row.manufacturerUrls),
        formatArray(row.submittalUrls),
        row.vendorName || '',
        row.typeName || '',
        row.tags || '',
        row.createdAt || '',
        row.updatedAt || '',
      ].map(v => this.csvField(v));

      csvLines.push(line.join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="catalog-export-${new Date().toISOString().split('T')[0]}.csv"`,
    );
    res.send(csvLines.join('\n'));
  }
}
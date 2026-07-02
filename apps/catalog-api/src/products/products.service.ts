import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { CreateProductDto, QueryProductsDto, UpdateProductDto } from './dto/product.dto';
import { randomUUID } from 'crypto';
import { isUUID } from 'class-validator';

const round2 = (n: number) => Math.round(n * 100) / 100;

type Actor = { id: string; email?: string };

@Injectable()
export class ProductsService {
  constructor(
    private db: DbService,
    private audit: AuditService,
  ) {}

  private serialize(row: any) {
    const cost = row.costPerUom == null ? null : Number(row.costPerUom);
    const margin = row.margin == null ? 0 : Number(row.margin);
    const priceEach = cost != null && margin < 100 ? round2(cost / (1 - margin / 100)) : null;
    const casePrice = priceEach == null ? null : round2(priceEach * (row.caseQty ?? 1));
    return {
      ...row,
      costPerUom: cost,
      weightLbs: row.weightLbs == null ? null : Number(row.weightLbs),
      margin,
      priceEach,
      casePrice,
    };
  }

  private toList(raw?: string): string[] {
    return (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async findAll(q: QueryProductsDto) {
    const conditions: string[] = [];
    const params: any[] = [];
    const add = (val: any) => {
      params.push(val);
      return `$${params.length}`;
    };

    if (!q.includeArchived) {
      conditions.push(`p."archivedAt" IS NULL`);
    }

    // Vendor filter (multiple)
    const vendorIds = this.toList(q.vendorId);
    if (vendorIds.length) {
      const placeholders = vendorIds.map((id) => add(id)).join(', ');
      conditions.push(`p."vendorId" IN (${placeholders})`);
    }

    // Type filter (multiple)
    const typeIds = this.toList(q.typeId);
    if (typeIds.length) {
      const placeholders = typeIds.map((id) => add(id)).join(', ');
      conditions.push(`p."typeId" IN (${placeholders})`);
    }

    // Tags filter – using product_tags junction table
    const tags = this.toList((q as any).tag); // tag is optional in query
    if (tags.length) {
      const tagConditions = tags.map((t) => `t."tags_name" ILIKE ${add(`%${t}%`)}`);
      conditions.push(
        `EXISTS (
          SELECT 1
          FROM catalog.product_tags pt
          JOIN catalog.tags t ON pt."tagId" = t.id
          WHERE pt."productId" = p.id AND (${tagConditions.join(' OR ')})
        )`
      );
    }

    // Search (multiple terms)
    const terms = this.toList(q.search);
    if (terms.length) {
      const termConds = terms.map((t) => {
        const ph = add(`%${t}%`);
        return `(p."productCode" ILIKE ${ph} OR p."normalizedCode" ILIKE ${ph} OR p.description ILIKE ${ph})`;
      });
      conditions.push(`(${termConds.join(' OR ')})`);
    }

    const whereClause = conditions.length ? conditions.join(' AND ') : '1=1';

    const countQuery = `SELECT COUNT(*) FROM catalog.products p WHERE ${whereClause}`;
    const countRes = await this.db.pool.query(countQuery, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const limit = q.take ?? 50;
    const skip = q.skip ?? 0;
    const limitPh = add(limit);
    const offsetPh = add(skip);

    const dataQuery = `
      SELECT p.*, v.name AS "vendorName", pt.name AS "typeName"
      FROM catalog.products p
      LEFT JOIN catalog.vendors v ON p."vendorId" = v.id
      LEFT JOIN catalog.product_types pt ON p."typeId" = pt.id
      WHERE ${whereClause}
      ORDER BY p."updatedAt" DESC
      LIMIT ${limitPh} OFFSET ${offsetPh}
    `;
    const dataRes = await this.db.pool.query(dataQuery, params);
    const items = dataRes.rows.map((r) => this.serialize(r));
    return { items, total };
  }

  async findOne(id: string) {
    const res = await this.db.pool.query(
     `SELECT p.*, v.name AS "vendorName", pt.name AS "typeName"
      FROM catalog.products p
      LEFT JOIN catalog.vendors v ON p."vendorId" = v.id
      LEFT JOIN catalog.product_types pt ON p."typeId" = pt.id
      WHERE p.id = $1`,
    [id],
    );
    if (res.rows.length === 0) throw new NotFoundException(`Product ${id} not found`);
    return this.serialize(res.rows[0]);
  }

  async create(dto: CreateProductDto, actor?: Actor) {
    // Allowed fields (matching new schema)
    const allowed = [
      'productCode', 'normalizedCode', 'description',
      'costPerUom', 'margin', 'uom', 'caseQty', 'weightLbs',
      'shopifyStatus', 'published',
      'vendorId', 'typeId',
      'dimensions', 'notes',
      'imageUrls', 'manufacturerUrls', 'submittalUrls',
      'handle',
      'productInformationList', 'altProductList',
      'category', 'categoryDescription',
    ];
    const data: any = { id: randomUUID() };
    for (const key of allowed) {
      if (dto[key] !== undefined && dto[key] !== null) {
        data[key] = dto[key];
      }
    }
    // Defaults
    if (data.shopifyStatus === undefined) data.shopifyStatus = true;
    if (data.published === undefined) data.published = false;
    if (data.caseQty === undefined) data.caseQty = 1;
    if (data.margin === undefined) data.margin = 25;

    if (typeof data.margin === 'number') {
      data.margin = Math.min(99.99, Math.max(0, data.margin));
    }

    if (!data.productCode || !data.normalizedCode || !data.uom) {
      throw new BadRequestException('productCode, normalizedCode, uom are required');
    }

    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(',');
    const sql = `INSERT INTO catalog.products (${keys.map(k => `"${k}"`).join(',')}) 
                 VALUES (${placeholders}) RETURNING *`;

    try {
      const res = await this.db.pool.query(sql, values);
      const product = res.rows[0];
      if (actor) {
        await this.audit.log({
          actorId: actor.id,
          actorEmail: actor.email ?? null,
          action: `Created product ${product.productCode}`,
          targetType: 'catalog.products',
          targetId: product.id,
          beforeState: null,
          afterState: product,
          context: { module: 'products' },
        });
      }
      return product;
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictException('A product with this code already exists.');
      }
      console.error('SQL Error:', err.message);
      throw new InternalServerErrorException('Failed to create product');
    }
  }

  async update(id: string, dto: UpdateProductDto, actor?: Actor) {
    const before = await this.findOne(id);

    if (typeof dto.margin === 'number') {
      dto.margin = Math.min(99.99, Math.max(0, dto.margin));
    }

    // Business rule: if published is set to false, also set shopifyStatus to false
    if (dto.published === false) {
      dto.shopifyStatus = false;
    }

    const setClause = Object.keys(dto).map((k, i) => `"${k}" = $${i + 1}`).join(',');
    const values = [...Object.values(dto), id];
    const res = await this.db.pool.query(
      `UPDATE catalog.products SET ${setClause} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    if (res.rows.length === 0) throw new NotFoundException(`Product ${id} not found`);

    const after = res.rows[0];
    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email ?? null,
        action: `Updated product ${after.productCode}`,
        targetType: 'catalog.products',
        targetId: id,
        beforeState: before,
        afterState: after,
        context: { module: 'products' },
      });
    }
    return this.serialize(after);
  }

  async archive(id: string, actor?: Actor) {
    const before = await this.findOne(id);
    const res = await this.db.pool.query(
      `UPDATE catalog.products SET "archivedAt" = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    if (res.rows.length === 0) throw new NotFoundException(`Product ${id} not found`);
    const after = res.rows[0];
    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email ?? null,
        action: `Archived product ${after.productCode}`,
        targetType: 'catalog.products',
        targetId: id,
        beforeState: before,
        afterState: after,
        context: { module: 'products' },
      });
    }
    return this.serialize(after);
  }

  async restore(id: string, actor?: Actor) {
    const before = await this.findOne(id);
    const res = await this.db.pool.query(
      `UPDATE catalog.products SET "archivedAt" = NULL WHERE id = $1 RETURNING *`,
      [id],
    );
    if (res.rows.length === 0) throw new NotFoundException(`Product ${id} not found`);
    const after = res.rows[0];
    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email ?? null,
        action: `Restored product ${after.productCode}`,
        targetType: 'catalog.products',
        targetId: id,
        beforeState: before,
        afterState: after,
        context: { module: 'products' },
      });
    }
    return this.serialize(after);
  }

  async bulkUpdate(ids: string[], action: string, value?: any, actor?: Actor) {
    const client = await this.db.pool.connect();

    try {
      await client.query('BEGIN');

      if (action === 'archiveByVendor') {
        const vendorId = value;
        if (!vendorId) throw new BadRequestException('Vendor ID is required');

        const res = await client.query(
          `UPDATE catalog.products 
           SET "archivedAt" = NOW() 
           WHERE "vendorId" = $1 AND "archivedAt" IS NULL
           RETURNING id`,
          [vendorId]
        );

        if (actor) {
          await this.audit.log(
            {
              actorId: actor.id,
              actorEmail: actor.email ?? null,
              action: `Archived all active products from vendor ${vendorId}`,
              targetType: 'catalog.products',
              targetId: `vendor-${vendorId}`,
              beforeState: null,
              afterState: null,
              context: { module: 'products', bulk: true, op: action, vendorId, count: res.rowCount },
            },
            client,
          );
        }

        await client.query('COMMIT');
        return { updated: res.rowCount || 0, skipped: 0 };
      }

      if (!ids?.length) {
        throw new BadRequestException('No product IDs provided');
      }

      const results: any[] = [];
      let skipped = 0;

      for (const id of ids) {
        const product = await this.findOne(id);
        let updateData: any = {};

        switch (action) {
          case 'raiseCostPercent':
          case 'lowerCostPercent': {
            const percent = Number(value);
            if (isNaN(percent) || percent <= 0 || percent > 1000) {
              throw new BadRequestException('Percent must be between 0.01 and 1000');
            }
            if (product.costPerUom == null) {
              skipped++;
              continue;
            }
            const factor = action === 'raiseCostPercent' ? (1 + percent / 100) : (1 - percent / 100);
            updateData.costPerUom = round2(product.costPerUom * factor);
            break;
          }
          case 'addFixedCost': {
            const amount = Number(value);
            if (isNaN(amount) || amount < 0) throw new BadRequestException('Amount must be positive');
            if (product.costPerUom == null) {
              skipped++;
              continue;
            }
            updateData.costPerUom = round2(product.costPerUom + amount);
            break;
          }
          case 'setMargin': {
            const newMargin = Number(value);
            if (isNaN(newMargin) || newMargin < 0 || newMargin > 99.99) {
              throw new BadRequestException('Margin must be between 0 and 99.99');
            }
            updateData.margin = newMargin;
            break;
          }
          case 'recategorize': {
            if (value?.vendor) updateData.vendorId = value.vendor;
            if (value?.type) updateData.typeId = value.type;
            if (value?.tags && Array.isArray(value.tags)) {
              await client.query(
                `DELETE FROM catalog.product_tags WHERE "productId" = $1`,
                [id]
              );
              if (value.tags.length > 0) {
                const tagIds: string[] = [];
                for (const tagName of value.tags) {
                  const trimmed = tagName.trim();
                  if (!trimmed) continue;
                  let tagRes = await client.query(
                    `SELECT id FROM catalog.tags WHERE "tags_name" = $1`,
                    [trimmed]
                  );
                  let tagId: string;
                  if (tagRes.rows.length === 0) {
                    tagId = randomUUID();
                    await client.query(
                      `INSERT INTO catalog.tags (id, "tags_name") VALUES ($1, $2) ON CONFLICT ("tags_name") DO NOTHING`,
                      [tagId, trimmed]
                    );
                    tagRes = await client.query(
                      `SELECT id FROM catalog.tags WHERE "tags_name" = $1`,
                      [trimmed]
                    );
                    tagId = tagRes.rows[0]?.id || tagId;
                  } else {
                    tagId = tagRes.rows[0].id;
                  }
                  tagIds.push(tagId);
                }
                if (tagIds.length > 0) {
                  const values = tagIds.map((tid) => `('${id}', '${tid}')`).join(',');
                  await client.query(
                    `INSERT INTO catalog.product_tags ("productId", "tagId") VALUES ${values}`
                  );
                }
              }
            }
            break;
          }
          case 'setPublished': {
            const pub = value === true;
            updateData.published = pub;
            if (!pub) updateData.shopifyStatus = false;
            break;
          }
          case 'archive': {
            updateData.archivedAt = new Date().toISOString();
            break;
          }
          default:
            throw new BadRequestException(`Unsupported action: ${action}`);
        }

        if (Object.keys(updateData).length === 0) continue;

        const keys = Object.keys(updateData);
        const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        const values = [...Object.values(updateData), id];
        const res = await client.query(
          `UPDATE catalog.products SET ${setClause} WHERE id = $${values.length} RETURNING *`,
          values,
        );
        const updated = res.rows[0];
        results.push(updated);

        if (actor) {
          await this.audit.log(
            {
              actorId: actor.id,
              actorEmail: actor.email ?? null,
              action: `Bulk ${action} on ${updated.productCode}`,
              targetType: 'catalog.products',
              targetId: id,
              beforeState: product,
              afterState: updated,
              context: { module: 'products', bulk: true, op: action },
            },
            client,
          );
        }
      }

      await client.query('COMMIT');
      return { updated: results.length, skipped };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Tags endpoints ──────────────────────────────────────
  async getTags(productId: string) {
    const res = await this.db.pool.query(
      `SELECT t.id, t."tags_name" AS name
       FROM catalog.product_tags pt
       JOIN catalog.tags t ON pt."tagId" = t.id
       WHERE pt."productId" = $1`,
      [productId]
    );
    return res.rows;
  }

  async updateTags(productId: string, tagIds: string[]) {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM catalog.product_tags WHERE "productId" = $1`,
        [productId]
      );
      if (tagIds && tagIds.length > 0) {
        const placeholders = tagIds.map((_, i) => `$${i + 2}`).join(', ');
        await client.query(
          `INSERT INTO catalog.product_tags ("productId", "tagId") VALUES ($1, ${placeholders})`,
          [productId, ...tagIds]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
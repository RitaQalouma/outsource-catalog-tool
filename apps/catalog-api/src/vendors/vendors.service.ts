import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import * as crypto from 'crypto';

type Actor = { id: string; email?: string };

@Injectable()
export class VendorsService {
  constructor(
    private db: DbService,
    private audit: AuditService,
  ) {}

  async findAll() {
    const res = await this.db.pool.query(
      `SELECT v.id, v.name,
        (SELECT COUNT(*) FROM catalog.products p 
         WHERE p."vendorId" = v.id AND p."archivedAt" IS NOT NULL) AS archived_count
       FROM catalog.vendors v 
       ORDER BY v.name`
    );
    return res.rows; // { id, name, archived_count }
  }

  async create(name: string, actor?: Actor) {
    const id = crypto.randomUUID();
    await this.db.pool.query(
      `INSERT INTO catalog.vendors (id, name) VALUES ($1, $2)`,
      [id, name]
    );
    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email ?? null,
        action: `Created vendor "${name}"`,
        targetType: 'catalog.vendors',
        targetId: id,
        beforeState: null,
        afterState: { id, name },
        context: { module: 'vendors' },
      });
    }
    return { id, name };
  }

  async update(id: string, name: string, actor?: Actor) {
    const before = await this.db.pool.query(
      `SELECT * FROM catalog.vendors WHERE id = $1`,
      [id]
    );
    if (before.rowCount === 0) throw new NotFoundException('Vendor not found');

    const result = await this.db.pool.query(
      `UPDATE catalog.vendors SET name = $1 WHERE id = $2 RETURNING *`,
      [name, id]
    );
    if (result.rowCount === 0) throw new NotFoundException('Vendor not found');
    const after = result.rows[0];

    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email ?? null,
        action: `Renamed vendor "${before.rows[0].name}" → "${name}"`,
        targetType: 'catalog.vendors',
        targetId: id,
        beforeState: before.rows[0],
        afterState: after,
        context: { module: 'vendors' },
      });
    }
    return after;
  }

  async remove(id: string, actor?: Actor) {
    // Check active products
    const check = await this.db.pool.query(
      `SELECT COUNT(*) FROM catalog.products WHERE "vendorId" = $1 AND "archivedAt" IS NULL`,
      [id]
    );
    const count = parseInt(check.rows[0].count, 10);
    if (count > 0) {
      throw new BadRequestException(
        `Cannot delete vendor: ${count} active product(s) still reference it. Archive or reassign them first.`
      );
    }

    const vendor = await this.db.pool.query(
      `SELECT name FROM catalog.vendors WHERE id = $1`,
      [id]
    );
    if (vendor.rowCount === 0) throw new NotFoundException('Vendor not found');
    const vendorName = vendor.rows[0].name;

    await this.db.pool.query(
      `DELETE FROM catalog.vendors WHERE id = $1`,
      [id]
    );

    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email ?? null,
        action: `Deleted vendor "${vendorName}"`,
        targetType: 'catalog.vendors',
        targetId: id,
        beforeState: vendor.rows[0],
        afterState: null,
        context: { module: 'vendors' },
      });
    }
  }

  async archiveAllProducts(vendorId: string, actor?: Actor) {
    const vendorRes = await this.db.pool.query(
      `SELECT id, name FROM catalog.vendors WHERE id = $1`,
      [vendorId]
    );
    if (vendorRes.rowCount === 0) throw new NotFoundException('Vendor not found');
    const vendor = vendorRes.rows[0];

    const result = await this.db.pool.query(
      `UPDATE catalog.products 
       SET "archivedAt" = NOW() 
       WHERE "vendorId" = $1 AND "archivedAt" IS NULL`,
      [vendorId]
    );

    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email ?? null,
        action: `Archived all active products from vendor "${vendor.name}"`,
        targetType: 'catalog.products',
        targetId: `vendor-${vendorId}`,
        beforeState: null,
        afterState: null,
        context: { 
          module: 'vendors', 
          op: 'archiveAllProducts', 
          vendorId, 
          vendorName: vendor.name,
          count: result.rowCount 
        },
      });
    }
    return { archivedCount: result.rowCount };
  }

  async restoreAllProducts(vendorId: string, actor?: Actor) {
    const vendorRes = await this.db.pool.query(
      `SELECT id, name FROM catalog.vendors WHERE id = $1`,
      [vendorId]
    );
    if (vendorRes.rowCount === 0) throw new NotFoundException('Vendor not found');
    const vendor = vendorRes.rows[0];

    const result = await this.db.pool.query(
      `UPDATE catalog.products 
       SET "archivedAt" = NULL 
       WHERE "vendorId" = $1 AND "archivedAt" IS NOT NULL`,
      [vendorId]
    );

    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email ?? null,
        action: `Restored all archived products from vendor "${vendor.name}"`,
        targetType: 'catalog.products',
        targetId: `vendor-${vendorId}`,
        beforeState: null,
        afterState: null,
        context: { 
          module: 'vendors', 
          op: 'restoreAllProducts', 
          vendorId, 
          vendorName: vendor.name,
          count: result.rowCount 
        },
      });
    }
    return { restoredCount: result.rowCount };
  }
}
import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../db/db.service';

export type AuditEntry = {
  /**
   * Catalog users.id (CUID). This is the catalog domain's OWN audit table, so we
   * use our own user id as the durable actor identity (not auth.uid()). No FK —
   * an audit row must survive the actor being deleted.
   */
  actorId: string | null;
  actorEmail?: string | null;         // snapshot of the actor's email AT write time (display only)
  actorRole?: unknown;                // optional role/claims snapshot (jsonb)
  action: string;
  targetType: string;                 // e.g. 'catalog.products'
  targetId: string;
  beforeState?: unknown;              // jsonb
  afterState?: unknown;               // jsonb
  context?: Record<string, unknown>;  // jsonb
};

export type AuditQuery = {
  limit: number;
  offset: number;
  action?: string;
  actorId?: string;
  tableName?: string;  // matched against targetType
  from?: string;
  to?: string;
};

/** Anything with a pg-style query method: the pool, or a transaction's client. */
type SqlExecutor = { query: (text: string, params?: any[]) => Promise<any> };

/**
 * catalog.audit_log (who/what/when) — owned by the catalog API role.
 *  - actorId is the catalog user id (CUID); actorEmail is a write-time snapshot.
 *  - RLS is enabled with no policy: only the owner role (this API) reads it.
 *
 * log() is best-effort when writing on the pool (failures logged, never thrown).
 * When an `executor` (a transaction client) is passed, the error is rethrown so
 * the caller's transaction can roll back — keeping data + audit atomic.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private db: DbService) {}

  private static json(v: unknown): string | null {
    return v === undefined || v === null ? null : JSON.stringify(v);
  }

  async log(entry: AuditEntry, executor?: SqlExecutor): Promise<void> {
    const db = executor ?? this.db.pool; // default: pool (autonomous write)
    try {
      await db.query(
        `INSERT INTO catalog.audit_log
           ("actorId", "actorEmail", "actorRole", action, "targetType", "targetId",
            "beforeState", "afterState", context, "occurredAt")
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())`,
        [
          entry.actorId ?? null,
          entry.actorEmail ?? null,
          AuditService.json(entry.actorRole),
          entry.action,
          entry.targetType,
          entry.targetId,
          AuditService.json(entry.beforeState),
          AuditService.json(entry.afterState),
          AuditService.json(entry.context),
        ],
      );
    } catch (err) {
      // Inside a caller's transaction: surface so they can roll back.
      // Autonomous (pool) write: best-effort — never take down a mutation.
      if (executor) throw err;
      this.logger.error('Failed to write audit log', err as any);
    }
  }

  async findAll(params: AuditQuery): Promise<{ items: any[]; total: number }> {
    const conditions: string[] = ['1=1'];
    const values: any[] = [];

    if (params.action) {
      conditions.push(`action ILIKE $${values.length + 1}`);
      values.push(`%${params.action}%`);
    }
    if (params.actorId) {
      conditions.push(`"actorId" = $${values.length + 1}`);
      values.push(params.actorId);
    }
    if (params.tableName) {
      conditions.push(`"targetType" = $${values.length + 1}`);
      values.push(params.tableName);
    }
    if (params.from) {
      conditions.push(`"occurredAt" >= $${values.length + 1}`);
      values.push(params.from);
    }
    if (params.to) {
      // Bare date (YYYY-MM-DD) → include the whole day, not just 00:00:00.
      const inclusiveTo = /^\d{4}-\d{2}-\d{2}$/.test(params.to)
        ? `${params.to} 23:59:59.999`
        : params.to;
      conditions.push(`"occurredAt" <= $${values.length + 1}`);
      values.push(inclusiveTo);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await this.db.pool.query(
      `SELECT COUNT(*)::int AS count FROM catalog.audit_log WHERE ${whereClause}`,
      values,
    );
    const total = countRes.rows[0].count as number;

    const dataRes = await this.db.pool.query(
      `SELECT id, "actorId", "actorEmail", "actorRole", action, "targetType", "targetId",
              "beforeState", "afterState", context, "occurredAt"
       FROM catalog.audit_log
       WHERE ${whereClause}
       ORDER BY "occurredAt" DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, params.limit, params.offset],
    );

    return { items: dataRes.rows, total };
  }
}
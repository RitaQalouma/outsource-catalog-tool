import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

// Raw node-postgres pool, used only by the ingest module.
// Deliberately NOT Prisma — ingest does bulk SQL and conflict resolution
// directly, which keeps it independent of the Prisma client entirely.
@Injectable()
export class PgService implements OnModuleDestroy {
  readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    this.pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }, // Supabase requires TLS
      max: 5,
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
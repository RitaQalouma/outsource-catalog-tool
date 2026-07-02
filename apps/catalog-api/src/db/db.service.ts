// import { Injectable, OnModuleInit } from '@nestjs/common';
// import { Pool } from 'pg';

// @Injectable()
// export class DbService implements OnModuleInit {
//   public pool: Pool;

//   constructor() {
//     this.pool = new Pool({
//       connectionString: process.env.DATABASE_URL,
//     });
//   }

//   async onModuleInit() {
//     await this.pool.connect();
//   }
  

// async writeAudit(params: {
//   userId: string;
//   action: string;
//   tableName: string;
//   recordId: string;
//   before?: any;
//   after?: any;
// }) {
//   await this.pool.query(
//     `INSERT INTO public.audit_log ("actorId", action, "table_name", "record_id", before, after)
//      VALUES ($1, $2, $3, $4, $5, $6)`,
//     [
//       params.userId,
//       params.action,
//       params.tableName,
//       params.recordId,
//       params.before ? JSON.stringify(params.before) : null,
//       params.after ? JSON.stringify(params.after) : null,
//     ],
//   );
// }}
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DbService implements OnModuleInit {
  public pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  async onModuleInit() {
    // Validate connectivity at boot; release the probe connection back to the pool.
    const client = await this.pool.connect();
    client.release();
  }
}
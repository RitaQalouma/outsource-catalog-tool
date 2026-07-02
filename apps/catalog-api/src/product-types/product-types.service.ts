import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import * as crypto from 'crypto';

@Injectable()
export class ProductTypesService {
  constructor(private db: DbService) {}

  async findAll() {
    const res = await this.db.pool.query(
      `SELECT id, name FROM catalog.product_types ORDER BY name`
    );
    return res.rows;
  }

  async create(name: string) {
    const id = crypto.randomUUID();
    await this.db.pool.query(
      `INSERT INTO catalog.product_types (id, name) VALUES ($1, $2)`,
      [id, name]
    );
    return { id, name };
  }

  async update(id: string, name: string) {
    const result = await this.db.pool.query(
      `UPDATE catalog.product_types SET name = $1 WHERE id = $2 RETURNING *`,
      [name, id]
    );
    if (result.rowCount === 0) throw new NotFoundException('Product type not found');
    return result.rows[0];
  }

  async remove(id: string) {
    const result = await this.db.pool.query(
      `DELETE FROM catalog.product_types WHERE id = $1`,
      [id]
    );
    if (result.rowCount === 0) throw new NotFoundException('Product type not found');
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import * as crypto from 'crypto';

@Injectable()
export class TagsService {
  constructor(private db: DbService) {}

  async findAll() {
    const res = await this.db.pool.query(
      `SELECT id, "tags_name" AS name FROM catalog.tags ORDER BY name`
    );
    return res.rows;
  }

  async create(name: string) {
    const id = crypto.randomUUID();
    await this.db.pool.query(
      `INSERT INTO catalog.tags (id, "tags_name") VALUES ($1, $2)`,
      [id, name]
    );
    return { id, name };
  }

  async update(id: string, name: string) {
    const result = await this.db.pool.query(
      `UPDATE catalog.tags SET "tags_name" = $1 WHERE id = $2 RETURNING id, "tags_name" AS name`,
      [name, id]
    );
    if (result.rowCount === 0) throw new NotFoundException('Tag not found');
    return result.rows[0];
  }

  async remove(id: string) {
    const result = await this.db.pool.query(
      `DELETE FROM catalog.tags WHERE id = $1`,
      [id]
    );
    if (result.rowCount === 0) throw new NotFoundException('Tag not found');
  }
}
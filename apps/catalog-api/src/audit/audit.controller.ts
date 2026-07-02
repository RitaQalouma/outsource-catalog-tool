import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { Roles } from '../auth/roles.decorator';

@Controller('audit-log')
@Roles('admin')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async findAll(
    @Query('limit') limit = '100',
    @Query('offset') offset = '0',
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('tableName') tableName?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    // Query params arrive as strings; clamp to sane bounds.
    const take = Math.min(Math.max(parseInt(String(limit), 10) || 100, 1), 500);
    const skip = Math.max(parseInt(String(offset), 10) || 0, 0);

    return this.audit.findAll({ limit: take, offset: skip, action, actorId, tableName, from, to });
  }
}
import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { DbService } from '../db/db.service';

@Module({
  controllers: [ExportController],
  providers: [ExportService, DbService],  // DbService provided locally
})
export class ExportModule {}
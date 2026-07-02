import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { DbModule } from '../db/db.module';

@Module({
  imports: [DbModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],   // ← add this
})
export class AuditModule {}
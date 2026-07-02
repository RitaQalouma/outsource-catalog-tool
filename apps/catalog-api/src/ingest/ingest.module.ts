import { Module } from '@nestjs/common';
import { IngestService } from './ingest.service';
import { IngestController } from './ingest.controller';
import { DbModule } from '../db/db.module';
import { AuditModule } from '../audit/audit.module';   

@Module({
  imports: [DbModule, AuditModule],  
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
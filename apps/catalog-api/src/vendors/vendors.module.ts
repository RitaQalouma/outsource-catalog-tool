import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { DbService } from '../db/db.service';
import { AuditModule } from '../audit/audit.module'; 

@Module({
  imports: [AuditModule],
  controllers: [VendorsController],
  providers: [VendorsService, DbService],   
})
export class VendorsModule {}


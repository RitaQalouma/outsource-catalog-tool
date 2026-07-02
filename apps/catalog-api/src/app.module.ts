import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbService } from './db/db.service';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { VendorsModule } from './vendors/vendors.module';
import { ProductTypesModule } from './product-types/product-types.module';
import { ExportController } from './export/export.controller';
import { ExportService } from './export/export.service';  // <-- ADD THIS IMPORT
import { IngestModule } from './ingest/ingest.module';
import { TagsModule } from './tags/tags.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    VendorsModule,
    ProductTypesModule,
    IngestModule,
    AuditModule,
    TagsModule,
  ],
  controllers: [ProductsController, ExportController],
  providers: [
    ProductsService,
    DbService,
    ExportService,  // <-- ADD THIS LINE
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
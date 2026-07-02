import { Module } from '@nestjs/common';
import { ProductTypesController } from './product-types.controller';
import { ProductTypesService } from './product-types.service';
import { DbService } from '../db/db.service';

@Module({
  controllers: [ProductTypesController],
  providers: [ProductTypesService, DbService],  
})
export class ProductTypesModule {}
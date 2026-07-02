import { Module } from '@nestjs/common';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { DbService } from '../db/db.service';

@Module({
  controllers: [TagsController],
  providers: [TagsService, DbService],   
})
export class TagsModule {}
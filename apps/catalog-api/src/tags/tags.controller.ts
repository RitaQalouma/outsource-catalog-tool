import {
  Controller, Get, Post, Patch, Delete, Param, Body, BadRequestException,
} from '@nestjs/common';
import { TagsService } from './tags.service';
import { Roles } from '../auth/roles.decorator';  

@Controller('tags')
@Roles('admin')                                     

export class TagsController {
  constructor(private readonly service: TagsService) {}

  @Get()
  async findAll() {
    return this.service.findAll();
  }

  @Post()
  async create(@Body('name') name: string) {
    if (!name || !name.trim()) throw new BadRequestException('Name is required');
    return this.service.create(name.trim());
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body('name') name: string) {
    if (!name || !name.trim()) throw new BadRequestException('Name is required');
    return this.service.update(id, name.trim());
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { success: true };
  }
}
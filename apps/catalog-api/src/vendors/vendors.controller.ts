// vendors/vendors.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import type { Request } from 'express';
import { VendorsService } from './vendors.service';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly service: VendorsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body('name') name: string, @Req() req: Request) {
    const actor = (req as any).user;
    return this.service.create(name, actor);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('name') name: string,
    @Req() req: Request,
  ) {
    const actor = (req as any).user;
    return this.service.update(id, name, actor);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const actor = (req as any).user;
    return this.service.remove(id, actor);
  }

  @Post(':id/archive-products')
  archiveProducts(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const actor = (req as any).user;
    return this.service.archiveAllProducts(id, actor);
  }

  @Post(':id/restore-products')
  restoreProducts(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const actor = (req as any).user;
    return this.service.restoreAllProducts(id, actor);
  }
}
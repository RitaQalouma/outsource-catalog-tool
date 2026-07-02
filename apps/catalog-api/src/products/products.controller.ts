
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';

import { ProductsService } from './products.service';
import { CreateProductDto, QueryProductsDto, UpdateProductDto } from './dto/product.dto';

// Pull the actor off the request once, so every handler stays consistent.
// NOTE: relies on an auth guard having populated req.user. If req.user is
// undefined, audit rows won't record an actor (and the route isn't protected).
const actorOf = (req: any) =>
  req?.user ? { id: req.user.id, email: req.user.email } : undefined;

@Controller('products')
@Roles('admin')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  findAll(@Query() query: QueryProductsDto) {
    return this.products.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }

  // ─── Tags endpoints ────────────────────────────────
  @Get(':id/tags')
  async getTags(@Param('id') id: string) {
    return this.products.getTags(id);
  }

  @Post(':id/tags')
  async updateTags(
    @Param('id') id: string,
    @Body('tagIds') tagIds: string[],
  ) {
    return this.products.updateTags(id, tagIds);
  }

  @Post()
  create(@Body() dto: CreateProductDto, @Req() req: any) {
    return this.products.create(dto, actorOf(req));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @Req() req: any) {
    return this.products.update(id, dto, actorOf(req));
  }

  @Post(':id/archive')
  archive(@Param('id') id: string, @Req() req: any) {
    return this.products.archive(id, actorOf(req));
  }

  @Post(':id/restore')
  restore(@Param('id') id: string, @Req() req: any) {
    return this.products.restore(id, actorOf(req));
  }

  @Post('bulk')
  async bulkUpdate(
    @Body() body: { ids: string[]; action: string; value?: any },
    @Req() req: any,
  ) {
    return this.products.bulkUpdate(body.ids, body.action, body.value, actorOf(req));
  }
}
import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  IsObject,
  Max,
  Min,
  ArrayNotEmpty,
  IsUUID,
} from 'class-validator';

export class CreateProductDto {
  // Required fields
  @IsString()
  productCode!: string;

  @IsString()
  normalizedCode!: string;

  @IsString()
  uom!: string;

  // Numeric fields
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPerUom?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightLbs?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99.99)
  margin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  caseQty?: number;

  // Text fields
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  dimensions?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Category (kept for transition, will be dropped later)
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  categoryDescription?: string;

  // Foreign keys
  @IsOptional()
  @IsString()
  @IsUUID(4, { each: false, message: 'vendorId must be a valid UUID' })
  vendorId?: string | null;

  @IsOptional()
  @IsString()
  @IsUUID(4, { each: false, message: 'typeId must be a valid UUID' })
  typeId?: string | null;

  // Booleans
  @IsOptional()
  @IsBoolean()
  shopifyStatus?: boolean; // was active

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  // New fields
  @IsOptional()
  @IsString()
  handle?: string;

  // Arrays (URLs)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  manufacturerUrls?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  submittalUrls?: string[];

  // JSON fields
  @IsOptional()
  @IsObject()
  productInformationList?: any; // jsonb, can be array or object

  @IsOptional()
  @IsObject()
  altProductList?: any; // jsonb

  // Note: tags are not in product table – they are handled separately via product_tags
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class QueryProductsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsString()
  typeId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
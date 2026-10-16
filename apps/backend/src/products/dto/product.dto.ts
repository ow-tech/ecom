import { Transform, Type } from "class-transformer";
import { IsEnum, IsInt, IsNotEmptyObject, IsObject, IsOptional, IsString, IsUUID, IsUrl, Max, MaxLength, Min } from "class-validator";
import { ProductMediaType, ProductStatus, ProductVariantStatus } from "@prisma/client";

const trim = ({ value }: { value: unknown }): unknown => typeof value === "string" ? value.trim() : value;
const upper = ({ value }: { value: unknown }): unknown => typeof value === "string" ? value.trim().toUpperCase() : value;

export class CreateProductDto {
  @IsUUID() categoryId!: string;
  @IsString() @MaxLength(200) @Transform(trim) name!: string;
  @IsString() @MaxLength(220) @Transform(trim) slug!: string;
  @IsOptional() @IsString() @MaxLength(120) @Transform(trim) brand?: string;
  @IsOptional() @IsString() @MaxLength(5000) @Transform(trim) description?: string;
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
}
export class UpdateProductDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) name?: string;
  @IsOptional() @IsString() @MaxLength(120) @Transform(trim) brand?: string;
  @IsOptional() @IsString() @MaxLength(5000) @Transform(trim) description?: string;
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
}
export class ProductListDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export class CreateVariantDto {
  @IsString() @MaxLength(200) @Transform(trim) name!: string;
  @IsOptional() @IsString() @MaxLength(120) @Transform(upper) sku?: string;
  @IsObject() @IsNotEmptyObject() attributes!: Record<string, unknown>;
  @IsOptional() @IsEnum(ProductVariantStatus) status?: ProductVariantStatus;
}
export class UpdateVariantDto {
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) name?: string;
  @IsOptional() @IsString() @MaxLength(120) @Transform(upper) sku?: string;
  @IsOptional() @IsObject() @IsNotEmptyObject() attributes?: Record<string, unknown>;
  @IsOptional() @IsEnum(ProductVariantStatus) status?: ProductVariantStatus;
}
export class CreateProductMediaDto {
  @IsString() @MaxLength(1024) @Transform(trim) storageKey!: string;
  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(2048) @Transform(trim) url?: string;
  @IsOptional() @IsUUID() productVariantId?: string;
  @IsOptional() @IsString() @MaxLength(500) @Transform(trim) altText?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsEnum(ProductMediaType) mediaType?: ProductMediaType;
}
export class UpdateProductMediaDto {
  @IsOptional() @IsString() @MaxLength(1024) @Transform(trim) storageKey?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(2048) @Transform(trim) url?: string;
  @IsOptional() @IsString() @MaxLength(500) @Transform(trim) altText?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsEnum(ProductMediaType) mediaType?: ProductMediaType;
}

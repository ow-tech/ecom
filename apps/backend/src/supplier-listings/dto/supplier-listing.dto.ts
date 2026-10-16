import { Transform, Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";
import { SupplierListingStatus } from "@prisma/client";

const trim = ({ value }: { value: unknown }): unknown => typeof value === "string" ? value.trim() : value;
const upper = ({ value }: { value: unknown }): unknown => typeof value === "string" ? value.trim().toUpperCase() : value;

export class CreateSupplierListingDto {
  @IsUUID() productId!: string;
  @IsOptional() @IsUUID() productVariantId?: string;
  @IsOptional() @IsString() @MaxLength(120) @Transform(upper) supplierSku?: string;
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) titleOverride?: string;
  @IsOptional() @IsString() @MaxLength(5000) @Transform(trim) descriptionOverride?: string;
  @Matches(/^\d+(?:\.\d{1,2})?$/) @MaxLength(20) @Transform(trim) price!: string;
  @Matches(/^[A-Z]{3}$/) @Transform(upper) currencyCode!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3650) warrantyDays?: number;
}
export class UpdateSupplierListingDto {
  @IsOptional() @IsString() @MaxLength(120) @Transform(upper) supplierSku?: string;
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) titleOverride?: string;
  @IsOptional() @IsString() @MaxLength(5000) @Transform(trim) descriptionOverride?: string;
  @IsOptional() @Matches(/^\d+(?:\.\d{1,2})?$/) @MaxLength(20) @Transform(trim) price?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) @Transform(upper) currencyCode?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3650) warrantyDays?: number;
}
export class SupplierListingListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}

/** Platform-only operational projection. It deliberately has no supplier mutation fields. */
export class PlatformListingListDto {
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsEnum(SupplierListingStatus) status?: SupplierListingStatus;
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}

export class SupplierProductSelectionDto {
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}

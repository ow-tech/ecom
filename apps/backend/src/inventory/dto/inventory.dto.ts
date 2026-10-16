import { Transform, Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";
import { InventoryLocationStatus, InventoryLocationType } from "@prisma/client";
const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
const upper = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim().toUpperCase() : value;
export class CreateInventoryLocationDto {
  @IsString() @MaxLength(160) @Transform(trim) name!: string;
  @IsString() @MaxLength(80) @Transform(upper) code!: string;
  @IsOptional() @IsString() @MaxLength(5000) @Transform(trim) description?: string;
  @IsOptional() @IsEnum(InventoryLocationType) type?: InventoryLocationType;
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(120) @Transform(trim) city?: string;
  @IsOptional() @IsString() @MaxLength(120) @Transform(trim) region?: string;
  @IsOptional() @Matches(/^[A-Z]{2}$/) @Transform(upper) countryCode?: string;
}
export class UpdateInventoryLocationDto {
  @IsOptional() @IsString() @MaxLength(160) @Transform(trim) name?: string;
  @IsOptional() @IsString() @MaxLength(80) @Transform(upper) code?: string;
  @IsOptional() @IsString() @MaxLength(5000) @Transform(trim) description?: string;
  @IsOptional() @IsEnum(InventoryLocationType) type?: InventoryLocationType;
  @IsOptional() @IsEnum(InventoryLocationStatus) status?: InventoryLocationStatus;
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(120) @Transform(trim) city?: string;
  @IsOptional() @IsString() @MaxLength(120) @Transform(trim) region?: string;
  @IsOptional() @Matches(/^[A-Z]{2}$/) @Transform(upper) countryCode?: string;
}
export class ReceiveStockDto { @IsUUID() supplierListingId!: string; @IsUUID() inventoryLocationId!: string; @Type(() => Number) @IsInt() @Min(1) quantity!: number; @IsOptional() @IsString() @MaxLength(80) @Transform(upper) referenceType?: string; @IsOptional() @IsString() @MaxLength(120) @Transform(trim) referenceId?: string; }
export class ItemQuantityDto { @Type(() => Number) @IsInt() @Min(1) quantity!: number; @IsOptional() @IsString() @MaxLength(80) @Transform(upper) referenceType?: string; @IsOptional() @IsString() @MaxLength(120) @Transform(trim) referenceId?: string; }
export class AdjustStockDto { @IsUUID() inventoryItemId!: string; @Type(() => Number) @IsInt() quantity!: number; @IsString() @MaxLength(1000) @Transform(trim) reason!: string; }
export class InventoryListDto { @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25; }

import { Transform } from "class-transformer";
import { DeliveryRateStatus, DeliveryZoneStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
const upper = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim().toUpperCase() : value;
export class CreateDeliveryZoneDto { @IsString() @MaxLength(160) @Transform(trim) name!: string; @Matches(/^[A-Z]{2}$/) @Transform(upper) countryCode!: string; @IsOptional() @IsString() @MaxLength(120) @Transform(trim) region?: string; @IsOptional() @IsString() @MaxLength(120) @Transform(trim) city?: string; @IsOptional() @IsEnum(DeliveryZoneStatus) status?: DeliveryZoneStatus; }
export class UpdateDeliveryZoneDto { @IsOptional() @IsString() @MaxLength(160) @Transform(trim) name?: string; @IsOptional() @IsString() @MaxLength(120) @Transform(trim) region?: string; @IsOptional() @IsString() @MaxLength(120) @Transform(trim) city?: string; @IsOptional() @IsEnum(DeliveryZoneStatus) status?: DeliveryZoneStatus; }
export class CreateDeliveryRateDto { @IsUUID() deliveryZoneId!: string; @IsString() @MaxLength(160) @Transform(trim) name!: string; @Matches(/^\d+(\.\d{1,2})?$/) amount!: string; @Matches(/^[A-Z]{3}$/) @Transform(upper) currencyCode!: string; @IsOptional() @IsEnum(DeliveryRateStatus) status?: DeliveryRateStatus; }
export class UpdateDeliveryRateDto { @IsOptional() @IsString() @MaxLength(160) @Transform(trim) name?: string; @IsOptional() @Matches(/^\d+(\.\d{1,2})?$/) amount?: string; @IsOptional() @IsEnum(DeliveryRateStatus) status?: DeliveryRateStatus; }
export class QuoteDeliveryDto { @Matches(/^\d+(\.\d{1,2})?$/) amount!: string; @IsOptional() @IsString() @MaxLength(1000) @Transform(trim) reason?: string; @IsOptional() @IsDateString() expiresAt?: string; }

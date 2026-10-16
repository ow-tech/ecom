import { Transform, Type } from "class-transformer";
import { IsEnum, IsInt, IsLatitude, IsLongitude, IsObject, IsOptional, IsPositive, IsString, Matches, MaxLength } from "class-validator";
import { PickupPointStatus } from "@prisma/client";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
const upper = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim().toUpperCase() : value;

export class CreatePickupPointDto {
  @IsString() @MaxLength(160) @Transform(trim) name!: string;
  @IsString() @MaxLength(80) @Transform(upper) code!: string;
  @IsString() @MaxLength(180) @Transform(trim) slug!: string;
  @Matches(/^[A-Z]{2}$/) @Transform(upper) countryCode!: string;
  @IsString() @MaxLength(120) @Transform(trim) region!: string;
  @IsString() @MaxLength(120) @Transform(trim) city!: string;
  @IsString() @MaxLength(300) @Transform(trim) address!: string;
  @IsOptional() @IsString() @MaxLength(240) @Transform(trim) landmark?: string;
  @IsOptional() @IsLatitude() latitude?: string;
  @IsOptional() @IsLongitude() longitude?: string;
  @IsOptional() @IsString() @MaxLength(40) @Transform(trim) phone?: string;
  @IsOptional() @IsObject() openingHours?: Record<string, unknown>;
  @IsOptional() @Matches(/^[A-Z]{3}$/) @Transform(upper) currencyCode?: string;
  @Matches(/^\d+(\.\d{1,2})?$/) pickupFee!: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() storageLimitDays?: number;
  @IsOptional() @IsEnum(PickupPointStatus) status?: PickupPointStatus;
}

export class UpdatePickupPointDto {
  @IsOptional() @IsString() @MaxLength(160) @Transform(trim) name?: string;
  @IsOptional() @IsString() @MaxLength(120) @Transform(trim) region?: string;
  @IsOptional() @IsString() @MaxLength(120) @Transform(trim) city?: string;
  @IsOptional() @IsString() @MaxLength(300) @Transform(trim) address?: string;
  @IsOptional() @IsString() @MaxLength(240) @Transform(trim) landmark?: string;
  @IsOptional() @IsLatitude() latitude?: string;
  @IsOptional() @IsLongitude() longitude?: string;
  @IsOptional() @IsString() @MaxLength(40) @Transform(trim) phone?: string;
  @IsOptional() @IsObject() openingHours?: Record<string, unknown>;
  @IsOptional() @Matches(/^\d+(\.\d{1,2})?$/) pickupFee?: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() storageLimitDays?: number;
  @IsOptional() @IsEnum(PickupPointStatus) status?: PickupPointStatus;
}

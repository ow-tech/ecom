import { Transform, Type } from "class-transformer";
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min } from "class-validator";
import { SupplierStatus } from "@prisma/client";

const trim = ({ value }: { value: unknown }): unknown => typeof value === "string" ? value.trim() : value;
const uppercase = ({ value }: { value: unknown }): unknown => typeof value === "string" ? value.trim().toUpperCase() : value;

export class CreateSupplierDto {
  @IsString() @MaxLength(120) @Transform(trim) displayName!: string;
  @IsOptional() @IsString() @MaxLength(140) @Transform(trim) slug?: string;
  @IsOptional() @IsString() @MaxLength(160) @Transform(trim) legalName?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsEmail() @MaxLength(320) @Transform(trim) businessEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) @Transform(trim) businessPhone?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(2048) @Transform(trim) websiteUrl?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(2048) @Transform(trim) logoUrl?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(2048) @Transform(trim) bannerUrl?: string;
  @IsOptional() @Matches(/^[A-Z]{2}$/) @Transform(uppercase) countryCode?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) @Transform(uppercase) currencyCode?: string;
}

export class UpdateSupplierDto {
  @IsOptional() @IsString() @MaxLength(120) @Transform(trim) displayName?: string;
  @IsOptional() @IsString() @MaxLength(160) @Transform(trim) legalName?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsEmail() @MaxLength(320) @Transform(trim) businessEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) @Transform(trim) businessPhone?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(2048) @Transform(trim) websiteUrl?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(2048) @Transform(trim) logoUrl?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(2048) @Transform(trim) bannerUrl?: string;
  @IsOptional() @Matches(/^[A-Z]{2}$/) @Transform(uppercase) countryCode?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) @Transform(uppercase) currencyCode?: string;
}

export class LifecycleReasonDto {
  @IsOptional() @IsString() @MaxLength(1000) @Transform(trim) reason?: string;
}

export class PlatformSupplierListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsEnum(SupplierStatus) status?: SupplierStatus;
  @IsOptional() @IsString() @MaxLength(120) @Transform(trim) search?: string;
}

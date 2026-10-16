import { Transform, Type } from "class-transformer";
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

export class CreateCommissionRateDto {
  @Matches(/^(0(\.\d{1,6})?|1(\.0{1,6})?)$/) rate!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class ManualAdjustmentDto {
  @Matches(/^-?(?:0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(?:\.[0-9]+)?)$/) amount!: string;
  @Matches(/^[A-Z]{3}$/) currencyCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}

export class CreateSettlementDto {
  @Matches(/^[A-Z]{3}$/) currencyCode!: string;
  @IsOptional() @IsDateString() periodStart?: string;
  @IsOptional() @IsDateString() periodEnd?: string;
}

export class MarkSettlementPaidDto {
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value) @IsString() @IsNotEmpty() @MaxLength(200) externalReference!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class SupplierLedgerListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}

import { Transform } from "class-transformer";
import { SupplierPayoutType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";

const trimmed = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
const upper = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim().toUpperCase() : value;

// Full payout instructions are allowed only on create, never on list/update DTOs.
export class CreatePayoutDestinationDto {
  @IsEnum(SupplierPayoutType) type!: SupplierPayoutType;
  @Matches(/^[A-Z]{3}$/) @Transform(upper) currencyCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) @Transform(trimmed) accountHolderName!: string;
  @IsOptional() @IsString() @MaxLength(160) @Transform(trimmed) bankName?: string;
  @IsOptional() @Matches(/^[A-Z]{2}$/) @Transform(upper) bankCountryCode?: string;
  @IsOptional() @IsString() @MaxLength(34) @Transform(trimmed) iban?: string;
  @IsOptional() @IsString() @MaxLength(60) @Transform(trimmed) accountNumber?: string;
  @IsOptional() @IsString() @MaxLength(11) @Transform(upper) swiftBic?: string;
  @IsOptional() @IsString() @MaxLength(30) @Transform(trimmed) mpesaPhone?: string;
}

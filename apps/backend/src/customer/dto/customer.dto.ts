import { Transform, Type } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

const trim = ({ value }: { value: unknown }): unknown => typeof value === "string" ? value.trim() : value;
const upper = ({ value }: { value: unknown }): unknown => typeof value === "string" ? value.trim().toUpperCase() : value;

export class UpdateCustomerProfileDto {
  @IsOptional() @IsString() @MaxLength(120) @Transform(trim) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) @Transform(trim) lastName?: string;
  @IsOptional() @IsString() @MaxLength(40) @Transform(trim) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) @Transform(trim) alternativePhone?: string;
}

export class CreateCustomerAddressDto {
  @IsOptional() @IsString() @MaxLength(80) @Transform(trim) label?: string;
  @IsString() @IsNotEmpty() @MaxLength(200) @Transform(trim) recipientName!: string;
  @IsString() @IsNotEmpty() @MaxLength(40) @Transform(trim) phone!: string;
  @IsOptional() @IsString() @MaxLength(40) @Transform(trim) alternativePhone?: string;
  @Matches(/^[A-Z]{2}$/) @Transform(upper) countryCode!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) @Transform(trim) region!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) @Transform(trim) city!: string;
  @IsOptional() @IsString() @MaxLength(160) @Transform(trim) estate?: string;
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) street?: string;
  @IsOptional() @IsString() @MaxLength(160) @Transform(trim) building?: string;
  @IsOptional() @IsString() @MaxLength(80) @Transform(trim) houseNumber?: string;
  @IsOptional() @IsString() @MaxLength(240) @Transform(trim) landmark?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 7 }) @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 7 }) @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsString() @MaxLength(1000) @Transform(trim) deliveryNotes?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateCustomerAddressDto {
  @IsOptional() @IsString() @MaxLength(80) @Transform(trim) label?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) @Transform(trim) recipientName?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(40) @Transform(trim) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) @Transform(trim) alternativePhone?: string;
  @IsOptional() @Matches(/^[A-Z]{2}$/) @Transform(upper) countryCode?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) @Transform(trim) region?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) @Transform(trim) city?: string;
  @IsOptional() @IsString() @MaxLength(160) @Transform(trim) estate?: string;
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) street?: string;
  @IsOptional() @IsString() @MaxLength(160) @Transform(trim) building?: string;
  @IsOptional() @IsString() @MaxLength(80) @Transform(trim) houseNumber?: string;
  @IsOptional() @IsString() @MaxLength(240) @Transform(trim) landmark?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 7 }) @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 7 }) @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsString() @MaxLength(1000) @Transform(trim) deliveryNotes?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

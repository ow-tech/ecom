import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from "class-validator";

export class RefundRequestItemDto {
  @IsUUID() orderItemId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
}

export class CreateRefundRequestDto {
  @IsString() @MaxLength(80) reasonCode!: string;
  @IsOptional() @IsString() @MaxLength(1000) reasonText?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => RefundRequestItemDto) items!: RefundRequestItemDto[];
}

export class ReviewRefundRequestDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

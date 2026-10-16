import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from "class-validator";
import { ReturnReasonCode, ReturnResolution, WarrantyResolution } from "@prisma/client";

export class ReturnItemDto { @IsUUID() orderItemId!: string; @Type(() => Number) @IsInt() @Min(1) quantity!: number; }
export class CreateReturnDto { @IsEnum(ReturnReasonCode) reasonCode!: ReturnReasonCode; @IsOptional() @IsString() @MaxLength(1000) reasonText?: string; @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReturnItemDto) items!: ReturnItemDto[]; }
export class TransitionDto { @IsOptional() @IsString() @MaxLength(1000) reason?: string; }
export class CompleteReturnDto extends TransitionDto { @IsEnum(ReturnResolution) resolution!: ReturnResolution; @IsOptional() @IsString() @MaxLength(1000) inspectionNote?: string; }
export class CreateWarrantyDto { @IsUUID() orderItemId!: string; @IsString() @MaxLength(2000) issueDescription!: string; }
export class ResolveWarrantyDto extends TransitionDto { @IsEnum(WarrantyResolution) resolution!: WarrantyResolution; @IsOptional() @IsString() @MaxLength(1000) resolutionNote?: string; }

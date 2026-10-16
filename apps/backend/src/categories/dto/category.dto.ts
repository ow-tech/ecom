import { Transform, Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { CategoryStatus } from "@prisma/client";

const trim = ({ value }: { value: unknown }): unknown => typeof value === "string" ? value.trim() : value;

export class CreateCategoryDto {
  @IsString() @MaxLength(160) @Transform(trim) name!: string;
  @IsString() @MaxLength(180) @Transform(trim) slug!: string;
  @IsOptional() @IsString() @MaxLength(5000) @Transform(trim) description?: string;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsEnum(CategoryStatus) status?: CategoryStatus;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MaxLength(160) @Transform(trim) name?: string;
  @IsOptional() @IsString() @MaxLength(5000) @Transform(trim) description?: string;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsEnum(CategoryStatus) status?: CategoryStatus;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

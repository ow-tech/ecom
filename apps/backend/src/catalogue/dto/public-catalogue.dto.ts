import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, Matches } from "class-validator";

const trim = ({ value }: { value: unknown }): unknown => typeof value === "string" ? value.trim() : value;

export class PublicCatalogueListDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(48) limit = 24;
}

export class PublicCatalogueProductListDto {
  @IsOptional() @IsString() @MaxLength(180) @Transform(trim) category?: string;
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) search?: string;
  @IsOptional() @IsString() @MaxLength(140) @Transform(trim) supplier?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) @Transform(({ value }) => typeof value === "string" ? value.trim().toUpperCase() : value) currency?: string;
  @IsOptional() @IsString() @Matches(/^\d+(\.\d{1,2})?$/) minPrice?: string;
  @IsOptional() @IsString() @Matches(/^\d+(\.\d{1,2})?$/) maxPrice?: string;
  @IsOptional() @IsIn(["newest", "name-asc", "price-asc", "price-desc", "relevance"]) sort: "newest" | "name-asc" | "price-asc" | "price-desc" | "relevance" = "newest";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(48) limit = 24;
}

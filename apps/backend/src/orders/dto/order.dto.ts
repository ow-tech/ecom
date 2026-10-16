import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class CancelOrderDto {
  @IsOptional() @IsString() @MaxLength(1000) @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value) reason?: string;
}

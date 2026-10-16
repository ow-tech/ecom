import { Transform } from "class-transformer"; import { IsOptional, IsString, Length, MaxLength } from "class-validator";
const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
export class FulfilmentTransitionDto { @IsOptional() @IsString() @MaxLength(1000) @Transform(trim) reason?: string; @IsOptional() @IsString() @MaxLength(1000) @Transform(trim) publicMessage?: string; @IsOptional() @IsString() @MaxLength(1000) @Transform(trim) internalNote?: string; }
export class CompletePickupDto extends FulfilmentTransitionDto { @IsString() @Length(6, 12) @Transform(trim) collectionCode!: string; }

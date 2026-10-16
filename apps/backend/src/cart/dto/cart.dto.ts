import { IsInt, IsUUID, Min } from "class-validator";

export class AddCartItemDto {
  @IsUUID() supplierListingId!: string;
  @IsInt() @Min(1) quantity!: number;
}

export class UpdateCartItemDto {
  @IsInt() @Min(1) quantity!: number;
}

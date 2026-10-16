import { FulfillmentMethod } from "@prisma/client";
import { IsEnum, IsOptional, IsUUID } from "class-validator";

export class PrepareCheckoutDto {
  @IsEnum(FulfillmentMethod) fulfillmentMethod!: FulfillmentMethod;
  @IsOptional() @IsUUID() addressId?: string;
  @IsOptional() @IsUUID() pickupPointId?: string;
}

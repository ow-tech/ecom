import { FulfillmentMethod, OrderStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

// Only actionable paid-order states are exposed in the operations queue.
// Other order states are managed through their canonical payment/refund paths.
export const deliveryQueueStatuses = [
  OrderStatus.PAYMENT_CONFIRMED, OrderStatus.PROCESSING, OrderStatus.READY_FOR_PICKUP, OrderStatus.OUT_FOR_DELIVERY,
] as const;

export class DeliveryOperationsQueryDto {
  @IsOptional() @IsEnum(FulfillmentMethod) fulfillmentMethod?: FulfillmentMethod;
  @IsOptional() @IsIn(deliveryQueueStatuses) status?: typeof deliveryQueueStatuses[number];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}

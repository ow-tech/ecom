import { PaymentProvider, PaymentStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class PaymentListDto {
  @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() providerReference?: string;
  @IsOptional() @IsEnum(PaymentProvider) provider?: PaymentProvider;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class BatchDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
export enum CheckoutPaymentMethod { CARD = "CARD", MPESA = "MPESA" }

export class InitializePaymentDto {
  @IsOptional() @IsEnum(CheckoutPaymentMethod) method?: CheckoutPaymentMethod;
}

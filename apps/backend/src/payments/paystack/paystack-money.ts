import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

const TWO_DECIMAL_CURRENCIES = new Set(["KES", "NGN", "GHS", "ZAR", "USD"]);

export function toPaystackMinorUnits(amount: Prisma.Decimal, currency: string): string {
  if (!TWO_DECIMAL_CURRENCIES.has(currency)) {
    throw new BadRequestException(`Unsupported Paystack currency exponent: ${currency}`);
  }
  if (amount.isNegative() || amount.decimalPlaces() > 2) {
    throw new BadRequestException("Payment amount must be a non-negative two-decimal value");
  }
  return amount.mul(100).toFixed(0);
}

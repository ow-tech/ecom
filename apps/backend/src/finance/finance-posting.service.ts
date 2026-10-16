import { Injectable } from "@nestjs/common";
import { Prisma, SupplierLedgerEntryType } from "@prisma/client";
import { CommissionPolicyService } from "./commission-policy.service";

@Injectable()
export class FinancePostingService {
  constructor(private readonly policy: CommissionPolicyService) {}
  async postCommissions(tx: Prisma.TransactionClient, supplierOrderId: string, earnedAt: Date) {
    const supplierOrder = await tx.supplierOrder.findUniqueOrThrow({ where: { id: supplierOrderId }, include: { items: true } });
    const { rate } = await this.policy.effectiveAt(tx, supplierOrder.supplierId, earnedAt);
    if (rate.lte(0) || rate.gt(1)) throw new Error("Marketplace commission rate must be greater than zero and at most 100%");
    for (const item of supplierOrder.items) {
      const commissionAmount = item.lineTotal.mul(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const supplierNetAmount = item.lineTotal.minus(commissionAmount);
      const commission = await tx.commissionRecord.upsert({ where: { orderItemId: item.id }, update: {}, create: { orderItemId: item.id, supplierId: item.supplierId, supplierOrderId, grossAmount: item.lineTotal, commissionRate: rate, commissionAmount, supplierNetAmount, currencyCode: item.currencyCode, earnedAt } });
      // The append-only ledger intentionally rejects zero-value rows. A 100% commission
      // is nevertheless a valid immutable commission record; it simply creates no payable
      // supplier movement.
      if (!supplierNetAmount.isZero()) await tx.supplierLedgerEntry.upsert({ where: { type_referenceId: { type: SupplierLedgerEntryType.SUPPLIER_EARNING, referenceId: commission.id } }, update: {}, create: { supplierId: item.supplierId, currencyCode: item.currencyCode, type: SupplierLedgerEntryType.SUPPLIER_EARNING, amountSigned: supplierNetAmount, referenceType: "COMMISSION_RECORD", referenceId: commission.id, description: `Supplier earning for order item ${item.id}` } });
    }
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SupplierLedgerEntryType, SupplierSettlementStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { RbacService } from "../rbac/rbac.service";
import { CreateCommissionRateDto, CreateSettlementDto, ManualAdjustmentDto, MarkSettlementPaidDto, SupplierLedgerListDto } from "./dto/finance.dto";
import { OperationalOutboxService } from "../operations/operations.service";
import { AuditService } from "../audit/audit.service";
import { CommissionPolicyService } from "./commission-policy.service";
import { PayoutDestinationsService } from "./payout-destinations.service";

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService, private readonly outbox: OperationalOutboxService, private readonly audit: AuditService, private readonly payout: PayoutDestinationsService, private readonly policy: CommissionPolicyService) {}
  private notification(userId: string, type: string, title: string, settlementId: string, key: string) { return { recipientUserId: userId, type, category: "SETTLEMENT", title, body: `Settlement ${settlementId} was ${type.replace("SETTLEMENT_", "").toLowerCase()}.`, entityType: "SUPPLIER_SETTLEMENT", entityId: settlementId, dedupeKey: `notification:${key}` }; }
  private async settlementNotifications(tx: Prisma.TransactionClient, settlement: { id: string; supplierId: string }, type: "SETTLEMENT_CREATED" | "SETTLEMENT_APPROVED" | "SETTLEMENT_PAID") { const recipients = await this.outbox.supplierRecipientIds(tx, settlement.supplierId, ["finance.read"]); for (const userId of recipients) { const key = `settlement:${settlement.id}:${type.replace("SETTLEMENT_", "").toLowerCase()}:user:${userId}`; await this.outbox.enqueue(tx, { eventType: type, aggregateType: "SupplierSettlement", aggregateId: settlement.id, dedupeKey: key, userId, payload: this.notification(userId, type, type.replace("_", " "), settlement.id, key) }); } }
  private async supplier(userId: string, organizationId: string) { await this.rbac.organizationContext(userId, organizationId, "finance.read"); const supplier = await this.prisma.supplier.findUnique({ where: { organizationId } }); if (!supplier) throw new NotFoundException("Supplier not found"); return supplier; }
  private ledgerOutput<T extends { amountSigned: Prisma.Decimal }>(row: T) { return { ...row, amountSigned: row.amountSigned.toFixed(2) }; }
  private commissionOutput<T extends { grossAmount: Prisma.Decimal; commissionRate: Prisma.Decimal; commissionAmount: Prisma.Decimal; supplierNetAmount: Prisma.Decimal }>(row: T) { return { ...row, grossAmount: row.grossAmount.toFixed(2), commissionRate: row.commissionRate.toFixed(6), commissionAmount: row.commissionAmount.toFixed(2), supplierNetAmount: row.supplierNetAmount.toFixed(2) }; }
  private settlementOutput<T extends { grossEarnings: Prisma.Decimal; refundAdjustments: Prisma.Decimal; otherAdjustments: Prisma.Decimal; netAmount: Prisma.Decimal; items?: Array<{ amount: Prisma.Decimal }> }>(row: T) { return { ...row, grossEarnings: row.grossEarnings.toFixed(2), refundAdjustments: row.refundAdjustments.toFixed(2), otherAdjustments: row.otherAdjustments.toFixed(2), netAmount: row.netAmount.toFixed(2), items: row.items?.map((item) => ({ ...item, amount: item.amount.toFixed(2) })) }; }
  private async balance(supplierId: string) { const rows = await this.prisma.supplierLedgerEntry.groupBy({ by: ["currencyCode"], where: { supplierId }, _sum: { amountSigned: true } }); return rows.map((row) => ({ currencyCode: row.currencyCode, balance: (row._sum.amountSigned ?? new Prisma.Decimal(0)).toFixed(2) })); }

  defaultCommission(userId: string) { return this.policy.defaultView(userId); }
  setDefaultCommission(userId: string, rate: string) { return this.policy.changeDefault(userId, rate); }
  platformSupplierCommission(userId: string, supplierId: string) { return this.policy.supplierView(userId, supplierId); }
  resetSupplierCommission(userId: string, supplierId: string) { return this.policy.resetSupplier(userId, supplierId); }
  async supplierCommissionPolicy(userId: string, orgId: string) {
    const supplier = await this.supplier(userId, orgId);
    return this.policy.supplierView(userId, supplier.id, orgId);
  }
  async supplierBalance(userId: string, organizationId: string) { const supplier = await this.supplier(userId, organizationId); return { supplierId: supplier.id, balances: await this.balance(supplier.id) }; }
  async supplierLedger(userId: string, organizationId: string, query: SupplierLedgerListDto) {
    const supplier = await this.supplier(userId, organizationId);
    const where = { supplierId: supplier.id };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.supplierLedgerEntry.count({ where }),
      this.prisma.supplierLedgerEntry.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.limit, take: query.limit }),
    ]);
    return { data: data.map((row) => this.ledgerOutput(row)), page: query.page, limit: query.limit, total };
  }
  async supplierCommissions(userId: string, organizationId: string) { const supplier = await this.supplier(userId, organizationId); return (await this.prisma.commissionRecord.findMany({ where: { supplierId: supplier.id }, orderBy: { earnedAt: "desc" }, take: 200 })).map((row) => this.commissionOutput(row)); }
  async supplierSettlements(userId: string, organizationId: string, id?: string) { const supplier = await this.supplier(userId, organizationId); if (id) { const row = await this.prisma.supplierSettlement.findFirst({ where: { id, supplierId: supplier.id }, include: { items: true } }); if (!row) throw new NotFoundException("Settlement not found"); return this.settlementOutput(row); } return (await this.prisma.supplierSettlement.findMany({ where: { supplierId: supplier.id }, orderBy: { createdAt: "desc" }, include: { items: true } })).map((row) => this.settlementOutput(row)); }
  async platformBalance(userId: string, supplierId: string) { await this.rbac.requirePlatform(userId, "platform.finance.read"); return { supplierId, balances: await this.balance(supplierId) }; }
  async platformLedger(userId: string, supplierId: string) { await this.rbac.requirePlatform(userId, "platform.finance.read"); return (await this.prisma.supplierLedgerEntry.findMany({ where: { supplierId }, orderBy: { createdAt: "desc" }, take: 200 })).map((row) => this.ledgerOutput(row)); }
  async platformCommissions(userId: string) { await this.rbac.requirePlatform(userId, "platform.finance.read"); return (await this.prisma.commissionRecord.findMany({ orderBy: { earnedAt: "desc" }, take: 200 })).map((row) => this.commissionOutput(row)); }
  async createRate(userId: string, supplierId: string, dto: CreateCommissionRateDto) { await this.rbac.requirePlatform(userId, "platform.finance.adjust"); const rate = new Prisma.Decimal(dto.rate); if (rate.lte(0) || rate.gt(1)) throw new BadRequestException("Marketplace commission rate must be greater than zero and at most 100%"); const effectiveFrom = new Date(dto.effectiveFrom); const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null; if (effectiveTo && effectiveTo <= effectiveFrom) throw new BadRequestException("effectiveTo must be after effectiveFrom"); return this.prisma.supplierCommissionRate.create({ data: { supplierId, rate, effectiveFrom, effectiveTo } }); }
  async manualAdjustment(userId: string, supplierId: string, dto: ManualAdjustmentDto) { await this.rbac.requirePlatform(userId, "platform.finance.adjust"); const amount = new Prisma.Decimal(dto.amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP); if (amount.isZero()) throw new BadRequestException("Adjustment amount cannot be zero"); return this.prisma.$transaction(async tx => { const row = await tx.supplierLedgerEntry.create({ data: { supplierId, currencyCode: dto.currencyCode, type: SupplierLedgerEntryType.MANUAL_ADJUSTMENT, amountSigned: amount, referenceType: "MANUAL_ADJUSTMENT", referenceId: randomUUID(), description: dto.reason, actorUserId: userId } }); await this.audit.emitInTransaction(tx, { actorUserId: userId, action: "FINANCE_MANUAL_ADJUSTMENT", entityType: "SUPPLIER_LEDGER_ENTRY", entityId: row.id, dedupeKey: `ledger:${row.id}:manual-adjustment`, metadata: { supplierId, currencyCode: dto.currencyCode, amount: amount.toFixed(2) } }); return this.ledgerOutput(row); }); }

  async createSettlement(userId: string, supplierId: string, dto: CreateSettlementDto) {
    await this.rbac.requirePlatform(userId, "platform.settlements.manage");
    const start = dto.periodStart ? new Date(dto.periodStart) : undefined; const end = dto.periodEnd ? new Date(dto.periodEnd) : undefined;
    if (start && end && end <= start) throw new BadRequestException("periodEnd must be after periodStart");
    try { return await this.prisma.$transaction(async (tx) => {
      const rows = await tx.supplierLedgerEntry.findMany({ where: { supplierId, currencyCode: dto.currencyCode, type: { not: SupplierLedgerEntryType.SETTLEMENT_DEBIT }, settlementItem: null, createdAt: { gte: start, lte: end } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      if (!rows.length) throw new ConflictException("No eligible ledger entries");
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SupplierLedgerEntry" WHERE "id" IN (${Prisma.join(rows.map((row) => Prisma.sql`${row.id}::uuid`))}) ORDER BY "id" FOR UPDATE`);
      if (await tx.supplierSettlementItem.count({ where: { ledgerEntryId: { in: rows.map((row) => row.id) } } })) throw new ConflictException("Ledger entries were concurrently claimed");
      const sum = (type?: SupplierLedgerEntryType) => rows.filter((row) => !type || row.type === type).reduce((total, row) => total.plus(row.amountSigned), new Prisma.Decimal(0));
      const net = sum(); if (net.lte(0)) throw new ConflictException("Settlement net amount must be positive");
      const gross = sum(SupplierLedgerEntryType.SUPPLIER_EARNING); const refunds = sum(SupplierLedgerEntryType.REFUND_DEBIT); const other = net.minus(gross).minus(refunds);
      const destination = dto.payoutDestinationId
        ? await this.payout.assertSelectable(tx, supplierId, dto.currencyCode, dto.payoutDestinationId)
        : null;
      const settlement = await tx.supplierSettlement.create({ data: {
        supplierId, currencyCode: dto.currencyCode, periodStart: start, periodEnd: end,
        grossEarnings: gross, refundAdjustments: refunds, otherAdjustments: other,
        netAmount: net, createdByUserId: userId,
        ...(destination ? { payoutDestinationId: destination.id } : {}),
        items: { create: rows.map(row => ({ ledgerEntryId: row.id, amount: row.amountSigned })) },
      }, include: { items: true } });
      await this.settlementNotifications(tx, settlement, "SETTLEMENT_CREATED");
      await this.audit.emitInTransaction(tx, { actorUserId: userId, action: "SETTLEMENT_CREATED", entityType: "SUPPLIER_SETTLEMENT", entityId: settlement.id, dedupeKey: `settlement:${settlement.id}:created:audit`, metadata: { supplierId, currencyCode: dto.currencyCode, netAmount: settlement.netAmount.toFixed(2) } });
      return this.settlementOutput(settlement);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 }); } catch (error) { if (["P2002", "P2034"].includes((error as { code?: string }).code ?? "")) throw new ConflictException("Ledger entries were concurrently claimed"); throw error; }
  }
  async listSettlements(userId: string, id?: string) { await this.rbac.requirePlatform(userId, "platform.finance.read"); if (id) { const row = await this.prisma.supplierSettlement.findUnique({ where: { id }, include: { items: { include: { ledgerEntry: true } } } }); if (!row) throw new NotFoundException("Settlement not found"); return this.settlementOutput(row); } return (await this.prisma.supplierSettlement.findMany({ include: { items: true }, orderBy: { createdAt: "desc" }, take: 200 })).map((row) => this.settlementOutput(row)); }
  async approveSettlement(userId: string, id: string) { await this.rbac.requirePlatform(userId, "platform.settlements.manage"); return this.prisma.$transaction(async tx => { await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SupplierSettlement" WHERE "id" = ${id}::uuid FOR UPDATE`); const row = await tx.supplierSettlement.findUnique({ where: { id } }); if (!row) throw new NotFoundException("Settlement not found"); if (row.status === SupplierSettlementStatus.APPROVED || row.status === SupplierSettlementStatus.PAID) return { id, status: row.status, idempotent: true }; if (row.status !== SupplierSettlementStatus.DRAFT) throw new ConflictException("Settlement is not approvable"); await tx.supplierSettlement.update({ where: { id }, data: { status: SupplierSettlementStatus.APPROVED, approvedAt: new Date(), approvedByUserId: userId } }); await this.settlementNotifications(tx, row, "SETTLEMENT_APPROVED"); await this.audit.emitInTransaction(tx, { actorUserId: userId, action: "SETTLEMENT_APPROVED", entityType: "SUPPLIER_SETTLEMENT", entityId: id, dedupeKey: `settlement:${id}:approved:audit`, metadata: {} }); return { id, status: SupplierSettlementStatus.APPROVED, idempotent: false }; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
  async markPaid(userId: string, id: string, dto: MarkSettlementPaidDto) {
    await this.rbac.requirePlatform(userId, "platform.settlements.manage");
    for (let attempt = 0; attempt < 3; attempt += 1) try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SupplierSettlement" WHERE "id" = ${id}::uuid FOR UPDATE`);
        const row = await tx.supplierSettlement.findUnique({ where: { id } });
        if (!row) throw new NotFoundException("Settlement not found");
        if (row.status === SupplierSettlementStatus.PAID) return { id, status: row.status, idempotent: true };
        if (row.status !== SupplierSettlementStatus.APPROVED) throw new ConflictException("Settlement must be approved before payment marking");
        await tx.supplierLedgerEntry.create({ data: { supplierId: row.supplierId, currencyCode: row.currencyCode, type: SupplierLedgerEntryType.SETTLEMENT_DEBIT, amountSigned: row.netAmount.negated(), referenceType: "SUPPLIER_SETTLEMENT", referenceId: row.id, description: `Settlement ${row.id} marked paid`, actorUserId: userId } });
        await tx.supplierSettlement.update({ where: { id }, data: { status: SupplierSettlementStatus.PAID, markedPaidAt: new Date(), markedPaidByUserId: userId, externalReference: dto.externalReference, note: dto.note } });
        await this.settlementNotifications(tx, row, "SETTLEMENT_PAID");
        await this.audit.emitInTransaction(tx, { actorUserId: userId, action: "SETTLEMENT_PAID", entityType: "SUPPLIER_SETTLEMENT", entityId: id, dedupeKey: `settlement:${id}:paid:audit`, metadata: { externalReference: dto.externalReference ?? null } });
        return { id, status: SupplierSettlementStatus.PAID, idempotent: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const prismaError = error as { code?: string; meta?: { code?: string } };
      if ((prismaError.code === "P2034" || (prismaError.code === "P2010" && prismaError.meta?.code === "40001")) && attempt < 2) continue;
      throw error;
    }
    throw new ConflictException("Settlement payment marking could not be serialized");
  }
}

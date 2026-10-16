import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { RbacService } from "../rbac/rbac.service";

@Injectable()
export class CommissionPolicyService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly rbac: RbacService, private readonly audit: AuditService) {}
  private validate(rate: Prisma.Decimal) {
    if (rate.lte(0) || rate.gt(1)) throw new BadRequestException("Commission rate must be greater than zero and at most 100%");
    return rate;
  }
  async defaultAt(db: Prisma.TransactionClient, at: Date) {
    const entry = await db.platformCommissionRate.findFirst({ where: { effectiveFrom: { lte: at } }, orderBy: { effectiveFrom: "desc" } });
    const fallback = new Prisma.Decimal(this.config.get<string>("DEFAULT_COMMISSION_RATE", "0.10"));
    return { rate: this.validate(entry?.rate ?? fallback), source: entry ? "PLATFORM_DEFAULT" as const : "ENV_DEFAULT" as const };
  }
  async effectiveAt(db: Prisma.TransactionClient, supplierId: string, at: Date) {
    const row = await db.supplierCommissionRate.findFirst({ where: { supplierId, effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] }, orderBy: { effectiveFrom: "desc" } });
    if (row) return { rate: this.validate(row.rate), source: "SUPPLIER" as const };
    return this.defaultAt(db, at);
  }
  async defaultView(actorId: string) {
    await this.rbac.requirePlatform(actorId, "platform.finance.read");
    const [current, history] = await Promise.all([
      this.defaultAt(this.prisma, new Date()),
      this.prisma.platformCommissionRate.findMany({ take: 25, orderBy: { effectiveFrom: "desc" }, select: { id: true, rate: true, effectiveFrom: true } }),
    ]);
    return { current: { source: current.source, rate: current.rate.toFixed(6) }, history: history.map(x => ({ ...x, rate: x.rate.toFixed(6) })) };
  }
  async changeDefault(actorId: string, rateText: string) {
    await this.rbac.requirePlatform(actorId, "platform.finance.adjust");
    const rate = this.validate(new Prisma.Decimal(rateText));
    return this.prisma.$transaction(async tx => {
      // A PostgreSQL advisory transaction lock serializes concurrent policy changes.
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(781129, 0)::text`);
      const prior = await tx.platformCommissionRate.findFirst({ orderBy: { effectiveFrom: "desc" } });
      const effectiveFrom = new Date(Math.max(Date.now(), (prior?.effectiveFrom.getTime() ?? 0) + 1));
      const saved = await tx.platformCommissionRate.create({ data: { rate, effectiveFrom, createdByUserId: actorId } });
      await this.audit.emitInTransaction(tx, { actorUserId: actorId, action: "PLATFORM_COMMISSION_DEFAULT_CHANGED", entityType: "PLATFORM_COMMISSION_RATE", entityId: saved.id, dedupeKey: `commission-default:${saved.id}`, metadata: { rate: rate.toFixed(6) } });
      return { id: saved.id, rate: rate.toFixed(6), effectiveFrom };
    });
  }
  async supplierView(actorId: string, supplierId: string, organizationId?: string) {
    if (organizationId) {
      await this.rbac.organizationContext(actorId, organizationId, "finance.read");
      const supplier = await this.prisma.supplier.findUnique({ where: { organizationId }, select: { id: true } });
      if (!supplier || supplier.id !== supplierId) throw new NotFoundException("Supplier not found");
    } else await this.rbac.requirePlatform(actorId, "platform.finance.read");
    if (!await this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } })) throw new NotFoundException("Supplier not found");
    const now = new Date();
    const [effective, fallback, history] = await Promise.all([
      this.effectiveAt(this.prisma, supplierId, now), this.defaultAt(this.prisma, now),
      this.prisma.supplierCommissionRate.findMany({ where: { supplierId }, orderBy: { effectiveFrom: "desc" }, take: 25, select: { id: true, rate: true, effectiveFrom: true, effectiveTo: true } }),
    ]);
    return { supplierId, rate: effective.rate.toFixed(6), source: effective.source, defaultRate: fallback.rate.toFixed(6), history: history.map(x => ({ ...x, rate: x.rate.toFixed(6) })) };
  }
  async resetSupplier(actorId: string, supplierId: string) {
    await this.rbac.requirePlatform(actorId, "platform.finance.adjust");
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Supplier" WHERE "id" = ${supplierId}::uuid FOR UPDATE`);
      if (!await tx.supplier.findUnique({ where: { id: supplierId }, select: { id: true } })) throw new NotFoundException("Supplier not found");
      const at = new Date();
      if (await tx.supplierCommissionRate.count({ where: { supplierId, effectiveFrom: { gt: at } } }))
        throw new ConflictException("Future scheduled supplier rates must be resolved before reverting");
      const closed = await tx.supplierCommissionRate.updateMany({
        where: { supplierId, effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] },
        data: { effectiveTo: at },
      });
      await this.audit.emitInTransaction(tx, { actorUserId: actorId, action: "SUPPLIER_COMMISSION_OVERRIDE_CLEARED", entityType: "SUPPLIER", entityId: supplierId, metadata: { schedulesClosed: closed.count } });
      return { supplierId, closed: closed.count, source: "DEFAULT" };
    });
  }
}

import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, Supplier, SupplierStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const transitions: Record<SupplierStatus, readonly SupplierStatus[]> = {
  DRAFT: [SupplierStatus.PENDING_REVIEW],
  PENDING_REVIEW: [SupplierStatus.ACTIVE, SupplierStatus.REJECTED],
  ACTIVE: [SupplierStatus.SUSPENDED],
  SUSPENDED: [SupplierStatus.ACTIVE],
  REJECTED: [],
};

@Injectable()
export class SupplierLifecycleService {
  private readonly logger = new Logger(SupplierLifecycleService.name);
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async transition(supplierId: string, nextStatus: SupplierStatus, actorUserId: string, reason?: string, beforeTransition?: (supplier: Supplier) => void): Promise<Supplier> {
    const transitioned = await this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) throw new NotFoundException("Supplier not found");
      if (!transitions[supplier.status].includes(nextStatus)) throw new ConflictException("Supplier lifecycle transition is not allowed");
      beforeTransition?.(supplier);

      const now = new Date();
      const data: Prisma.SupplierUncheckedUpdateManyInput = { status: nextStatus };
      if (supplier.status === SupplierStatus.PENDING_REVIEW && nextStatus === SupplierStatus.ACTIVE) {
        data.approvedAt = now;
        data.approvedByUserId = actorUserId;
      }
      if (nextStatus === SupplierStatus.REJECTED) {
        data.rejectedAt = now;
        data.rejectedByUserId = actorUserId;
        data.rejectionReason = reason ?? null;
      }
      if (nextStatus === SupplierStatus.SUSPENDED) {
        data.suspendedAt = now;
        data.suspendedByUserId = actorUserId;
        data.suspensionReason = reason ?? null;
      }

      const result = await tx.supplier.updateMany({ where: { id: supplierId, status: supplier.status }, data });
      if (result.count !== 1) throw new ConflictException("Supplier lifecycle transition is no longer current");
      await tx.supplierStatusHistory.create({ data: { supplierId, previousStatus: supplier.status, newStatus: nextStatus, actorUserId, reason: reason ?? null } });
      await this.audit.emitInTransaction(tx, { actorUserId, action: "SUPPLIER_STATUS_CHANGED", entityType: "SUPPLIER", entityId: supplierId, dedupeKey: `supplier:${supplierId}:status:${nextStatus}`, metadata: { previousStatus: supplier.status, status: nextStatus } });
      return { supplier: await tx.supplier.findUniqueOrThrow({ where: { id: supplierId } }), previousStatus: supplier.status };
    });
    this.logger.log({ event: "supplier.lifecycle_transition", supplierId, actorUserId, previousStatus: transitioned.previousStatus, newStatus: nextStatus });
    return transitioned.supplier;
  }

  assertOnboardingComplete(supplier: Supplier): void {
    const missing = [
      !supplier.displayName.trim() && "displayName",
      !supplier.legalName?.trim() && "legalName",
      !supplier.businessEmail?.trim() && "businessEmail",
      !supplier.businessPhone?.trim() && "businessPhone",
      !supplier.countryCode && "countryCode",
      !supplier.currencyCode && "currencyCode",
    ].filter(Boolean);
    if (missing.length > 0) throw new BadRequestException(`Supplier onboarding is incomplete: ${missing.join(", ")}`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplier.businessEmail!) || !/^[A-Z]{2}$/.test(supplier.countryCode!) || !/^[A-Z]{3}$/.test(supplier.currencyCode!)) {
      throw new BadRequestException("Supplier onboarding details are invalid");
    }
  }
}

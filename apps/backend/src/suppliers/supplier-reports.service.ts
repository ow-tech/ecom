import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RbacService } from "../rbac/rbac.service";
import { SuppliersService } from "./suppliers.service";

@Injectable()
export class SupplierReportsService {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService, private readonly suppliers: SuppliersService) {}
  async overview(userId: string, organizationId: string) {
    const context = await this.rbac.organizationContext(userId, organizationId, "supplier.read");
    const supplier = await this.prisma.supplier.findUnique({ where: { organizationId }, select: { id: true } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    const has = (permission: string) => context.permissions.includes(permission);
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Reuse the existing authoritative permission-filtered overview, never count a paginated list.
    const [summary, statusCounts, paidGross] = await Promise.all([
      this.suppliers.overview(userId, organizationId),
      has("orders.read") ? this.prisma.supplierOrder.groupBy({
        by: ["status"], where: { supplierId: supplier.id, createdAt: { gte: from } },
        _count: { _all: true },
      }) : null,
      has("finance.read") ? this.prisma.$queryRaw<Array<{ currencyCode: string; orderCount: number; merchandiseSubtotal: Prisma.Decimal }>>(Prisma.sql`
        SELECT o."currencyCode" AS "currencyCode", COUNT(*)::int AS "orderCount",
               COALESCE(SUM(s."subtotal"), 0)::numeric AS "merchandiseSubtotal"
        FROM "SupplierOrder" s JOIN "Order" o ON o."id" = s."orderId"
        WHERE s."supplierId" = ${supplier.id}::uuid
          AND s."createdAt" >= ${from}
          AND o."paymentStatus" = 'PAID'
        GROUP BY o."currencyCode" ORDER BY o."currencyCode"
      `) : null,
    ]);
    return {
      period: { since: from, label: "Last 30 days" },
      overview: summary,
      orderStatuses: statusCounts === null ? null : statusCounts.map(row => ({ status: row.status, count: row._count._all })).sort((a, b) => a.status.localeCompare(b.status)),
      // INV-REPORT-01: gross paid merchandise, before commissions, returns and refunds.
      // Never describe this number as net supplier earnings or a payable balance.
      paidMerchandise: paidGross === null ? null : paidGross.map(row => ({ currencyCode: row.currencyCode, paidSupplierOrders: row.orderCount, subtotal: row.merchandiseSubtotal.toFixed(2) })),
    };
  }
}

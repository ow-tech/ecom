import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DeliveryQuoteStatus, OrderPaymentStatus, OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { commerceConflict } from "../commerce/commerce-error";
import { CustomerService } from "../customer/customer.service";
import { PrismaService } from "../prisma/prisma.service";
import { RbacService } from "../rbac/rbac.service";
import { OperationalOutboxService } from "../operations/operations.service";
import { DeliveryOperationsQueryDto, deliveryQueueStatuses } from "./dto/delivery-operations.dto";
import { CreateDeliveryRateDto, CreateDeliveryZoneDto, QuoteDeliveryDto, UpdateDeliveryRateDto, UpdateDeliveryZoneDto } from "./dto/delivery.dto";

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService, private readonly customer: CustomerService, private readonly outbox: OperationalOutboxService) {}
  private rateOutput<T extends { amount: Prisma.Decimal }>(row: T) { return { ...row, amount: row.amount.toFixed(2) }; }
  async operations(userId: string, query: DeliveryOperationsQueryDto) {
    await this.rbac.requirePlatform(userId, "platform.delivery.read");
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const where: Prisma.OrderWhereInput = {
      paymentStatus: OrderPaymentStatus.PAID,
      status: query.status ? query.status : { in: [...deliveryQueueStatuses] },
      ...(query.fulfillmentMethod ? { fulfillmentMethod: query.fulfillmentMethod } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        // INV-DELIVERY-OPS-01: No customer identifiers, raw address, collection code or internal notes.
        select: {
          id: true, orderNumber: true, status: true, paymentStatus: true,
          fulfillmentMethod: true, currencyCode: true, total: true, createdAt: true, updatedAt: true,
          pickupSnapshot: { select: { name: true, city: true } },
          deliveryAddress: { select: { region: true, city: true } },
          supplierOrders: {
            orderBy: { id: "asc" },
            select: { id: true, status: true, supplier: { select: { displayName: true } } },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { data: rows.map(({ total: amount, ...row }) => ({ ...row, total: amount.toFixed(2) })), total, page, limit };
  }

  async zones(userId: string) { await this.rbac.requirePlatform(userId, "platform.delivery.read"); return this.prisma.deliveryZone.findMany({ include: { rates: true }, orderBy: { createdAt: "asc" } }); }
  async createZone(userId: string, dto: CreateDeliveryZoneDto) { await this.rbac.requirePlatform(userId, "platform.delivery.manage"); return this.prisma.deliveryZone.create({ data: dto }); }
  async updateZone(userId: string, id: string, dto: UpdateDeliveryZoneDto) { await this.rbac.requirePlatform(userId, "platform.delivery.manage"); if (!await this.prisma.deliveryZone.findUnique({ where: { id } })) throw new NotFoundException("Delivery zone not found"); return this.prisma.deliveryZone.update({ where: { id }, data: dto }); }
  async rates(userId: string) { await this.rbac.requirePlatform(userId, "platform.delivery.read"); return (await this.prisma.deliveryRate.findMany({ include: { deliveryZone: true }, orderBy: { createdAt: "asc" } })).map((row) => this.rateOutput(row)); }
  async createRate(userId: string, dto: CreateDeliveryRateDto) { await this.rbac.requirePlatform(userId, "platform.delivery.manage"); if (!await this.prisma.deliveryZone.findUnique({ where: { id: dto.deliveryZoneId } })) throw new NotFoundException("Delivery zone not found"); try { return this.rateOutput(await this.prisma.deliveryRate.create({ data: { ...dto, amount: new Prisma.Decimal(dto.amount) } })); } catch (error) { if ((error as { code?: string }).code === "P2002") throw new ConflictException("An active rate already exists for this zone and currency"); throw error; } }
  async updateRate(userId: string, id: string, dto: UpdateDeliveryRateDto) { await this.rbac.requirePlatform(userId, "platform.delivery.manage"); if (!await this.prisma.deliveryRate.findUnique({ where: { id } })) throw new NotFoundException("Delivery rate not found"); return this.rateOutput(await this.prisma.deliveryRate.update({ where: { id }, data: { ...dto, amount: dto.amount === undefined ? undefined : new Prisma.Decimal(dto.amount) } })); }
  async quotes(userId: string) { await this.rbac.requirePlatform(userId, "platform.delivery.read"); return this.prisma.deliveryQuote.findMany({ include: { order: { select: { orderNumber: true, status: true } } }, orderBy: { createdAt: "asc" } }); }
  async quoteDetail(userId: string, id: string) { await this.rbac.requirePlatform(userId, "platform.delivery.read"); const quote = await this.prisma.deliveryQuote.findUnique({ where: { id }, include: { order: { include: { deliveryAddress: true } } } }); if (!quote) throw new NotFoundException("Delivery quote not found"); return quote; }
  async quote(userId: string, id: string, dto: QuoteDeliveryDto) {
    await this.rbac.requirePlatform(userId, "platform.delivery.quote");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "DeliveryQuote" WHERE "id" = ${id}::uuid FOR UPDATE`);
      const quote = await tx.deliveryQuote.findUnique({ where: { id }, include: { order: { include: { payments: true, customerProfile: { select: { userId: true } } } } } });
      if (!quote) throw new NotFoundException("Delivery quote not found");
      if (quote.status !== DeliveryQuoteStatus.PENDING || quote.order.status !== OrderStatus.AWAITING_DELIVERY_QUOTE || quote.order.paymentStatus !== OrderPaymentStatus.UNPAID) throw commerceConflict("DELIVERY_QUOTE_NOT_PENDING", "Delivery quote is not pending");
      if (quote.order.payments.some((payment) => payment.status !== PaymentStatus.FAILED && payment.status !== PaymentStatus.CANCELLED)) throw commerceConflict("PAYMENT_AMOUNT_BOUND", "An existing payment attempt prevents quote changes");
      const updated = await tx.deliveryQuote.update({ where: { id }, data: { status: DeliveryQuoteStatus.QUOTED, amount: new Prisma.Decimal(dto.amount), currencyCode: quote.order.currencyCode, reason: dto.reason, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null, calculatedByUserId: userId } });
      await this.outbox.enqueue(tx, { eventType: "DELIVERY_QUOTE_READY", aggregateType: "DeliveryQuote", aggregateId: updated.id, dedupeKey: `delivery-quote:${updated.id}:quoted`, userId: quote.order.customerProfile.userId, payload: { recipientUserId: quote.order.customerProfile.userId, type: "DELIVERY_QUOTE_READY", category: "DELIVERY", title: "Delivery quote ready", body: `A delivery quote is ready for order ${quote.order.orderNumber}.`, entityType: "ORDER", entityId: quote.orderId, dedupeKey: `notification:delivery-quote:${updated.id}:quoted` } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async approve(userId: string, orderId: string) {
    const profile = await this.customer.ensureCustomerProfile(userId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`);
      const order = await tx.order.findFirst({ where: { id: orderId, customerProfileId: profile.id }, include: { deliveryQuote: true, payments: true } });
      if (!order) throw new NotFoundException("Order not found");
      const quote = order.deliveryQuote;
      if (!quote || quote.status !== DeliveryQuoteStatus.QUOTED || quote.amount === null) throw commerceConflict("DELIVERY_QUOTE_NOT_QUOTED", "Delivery quote is not ready for approval");
      if (quote.expiresAt && quote.expiresAt <= new Date()) throw commerceConflict("DELIVERY_QUOTE_EXPIRED", "Delivery quote has expired");
      if (quote.currencyCode !== order.currencyCode) throw commerceConflict("DELIVERY_QUOTE_CURRENCY_MISMATCH", "Delivery quote currency does not match the order");
      if (order.status !== OrderStatus.AWAITING_DELIVERY_QUOTE || order.paymentStatus !== OrderPaymentStatus.UNPAID) throw commerceConflict("ORDER_NOT_PAYABLE", "Order is not awaiting a delivery quote");
      if (order.payments.length > 0) throw commerceConflict("PAYMENT_AMOUNT_BOUND", "An existing payment attempt prevents total changes");
      const total = order.subtotal.plus(quote.amount);
      await tx.deliveryQuote.update({ where: { id: quote.id }, data: { status: DeliveryQuoteStatus.APPROVED, approvedAt: new Date() } });
      await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.PENDING_PAYMENT, deliveryFee: quote.amount, total } });
      await tx.orderStatusHistory.create({ data: { orderId: order.id, previousStatus: OrderStatus.AWAITING_DELIVERY_QUOTE, newStatus: OrderStatus.PENDING_PAYMENT, actorUserId: userId, publicMessage: "Delivery quote approved; order awaiting payment" } });
      return { orderId: order.id, status: OrderStatus.PENDING_PAYMENT, deliveryFee: quote.amount.toFixed(2), total: total.toFixed(2) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

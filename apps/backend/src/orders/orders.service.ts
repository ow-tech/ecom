import { Injectable, NotFoundException } from "@nestjs/common";
import { CartStatus, OrderPaymentStatus, OrderStatus, PaymentStatus, Prisma, SupplierOrderStatus } from "@prisma/client";
import { commerceConflict } from "../commerce/commerce-error";
import { CustomerService } from "../customer/customer.service";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import { RbacService } from "../rbac/rbac.service";
import { CancelOrderDto } from "./dto/order.dto";
import { OperationalOutboxService } from "../operations/operations.service";

const orderInclude = {
  deliveryAddress: true,
  pickupSnapshot: true,
  deliveryQuote: true,
  items: { orderBy: { createdAt: "asc" as const } },
  supplierOrders: { orderBy: { createdAt: "asc" as const } },
  statusHistory: { orderBy: { createdAt: "asc" as const } },
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService, private readonly customer: CustomerService, private readonly inventory: InventoryService, private readonly rbac: RbacService, private readonly outbox: OperationalOutboxService) {}

  private output<T extends { subtotal: Prisma.Decimal; deliveryFee: Prisma.Decimal; pickupFee: Prisma.Decimal; total: Prisma.Decimal; items?: Array<{ unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal }>; supplierOrders?: Array<{ subtotal: Prisma.Decimal }> }>(order: T) {
    return { ...order, subtotal: order.subtotal.toFixed(2), deliveryFee: order.deliveryFee.toFixed(2), pickupFee: order.pickupFee.toFixed(2), total: order.total.toFixed(2), items: order.items?.map((item) => ({ ...item, unitPrice: item.unitPrice.toFixed(2), lineTotal: item.lineTotal.toFixed(2) })), supplierOrders: order.supplierOrders?.map((supplierOrder) => ({ ...supplierOrder, subtotal: supplierOrder.subtotal.toFixed(2) })) };
  }

  async list(userId: string) {
    const profile = await this.customer.ensureCustomerProfile(userId);
    const orders = await this.prisma.order.findMany({ where: { customerProfileId: profile.id }, include: { supplierOrders: true, items: { select: { productNameSnapshot: true, variantNameSnapshot: true, quantity: true, unitPrice: true, lineTotal: true, originSnapshot: true, deliveryMinDaysSnapshot: true, deliveryMaxDaysSnapshot: true } } }, orderBy: { createdAt: "desc" } });
    return orders.map((order) => this.output(order));
  }

  async get(userId: string, orderId: string) {
    const profile = await this.customer.ensureCustomerProfile(userId);
    const order = await this.prisma.order.findFirst({ where: { id: orderId, customerProfileId: profile.id }, include: orderInclude });
    if (!order) throw new NotFoundException("Order not found");
    return this.output(order);
  }

  // Checkout converts the basket before Paystack initializes. Safe cancellation
  // must preserve those items, including when the cart API created a new empty cart.
  private async restoreCartAfterCancellation(tx: Prisma.TransactionClient, checkoutAttemptId: string, customerProfileId: string) {
    const attempt = await tx.checkoutAttempt.findUnique({ where: { id: checkoutAttemptId }, select: { cartId: true } });
    if (!attempt) return;
    const original = await tx.cart.findFirst({ where: { id: attempt.cartId, customerProfileId, status: CartStatus.CONVERTED } });
    if (!original) return;
    const current = await tx.cart.findFirst({ where: { customerProfileId, status: CartStatus.ACTIVE } });
    if (!current) {
      await tx.cart.update({ where: { id: original.id }, data: { status: CartStatus.ACTIVE } });
      return;
    }
    const currentItems = await tx.cartItem.findMany({ where: { cartId: current.id } });
    if (!currentItems.length) {
      await tx.cart.update({ where: { id: current.id }, data: { status: CartStatus.ABANDONED } });
      await tx.cart.update({ where: { id: original.id }, data: { status: CartStatus.ACTIVE } });
      return;
    }
    if (current.currencyCode !== original.currencyCode)
      throw commerceConflict("CART_CURRENCY_MISMATCH", "Your current cart uses a different currency. Clear it before restoring the cancelled checkout.");
    const previous = await tx.cartItem.findMany({ where: { cartId: original.id } });
    for (const item of previous) {
      const matched = currentItems.find(existing => existing.supplierListingId === item.supplierListingId);
      if (matched) {
        await tx.cartItem.update({ where: { id: matched.id }, data: { quantity: matched.quantity + item.quantity } });
      } else {
        await tx.cartItem.create({ data: {
          cartId: current.id, supplierListingId: item.supplierListingId, quantity: item.quantity,
          unitPriceSnapshot: item.unitPriceSnapshot, currencyCode: item.currencyCode,
        } });
      }
    }
    // Keep the converted cart as an immutable checkout reference; active basket owns the recovered copies.
  }

  async cancel(userId: string, orderId: string, dto: CancelOrderDto) {
    const profile = await this.customer.ensureCustomerProfile(userId);
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, customerProfileId: profile.id } });
      if (!order) throw new NotFoundException("Order not found");
      if (order.status === OrderStatus.CANCELLED) return;
      if ((order.status !== OrderStatus.PENDING_PAYMENT && order.status !== OrderStatus.AWAITING_DELIVERY_QUOTE) || order.paymentStatus !== OrderPaymentStatus.UNPAID) throw commerceConflict("CHECKOUT_ALREADY_TERMINAL", "Only unpaid pending orders can be cancelled");
      // An unresolved Paystack attempt might still settle asynchronously. Never cancel
      // or release reserved inventory before the provider outcome is authoritative.
      const unsettled = await tx.payment.count({ where: { orderId: order.id, status: { in: [PaymentStatus.INITIALIZATION_PENDING, PaymentStatus.PENDING, PaymentStatus.UNKNOWN, PaymentStatus.SUCCEEDED] } } });
      if (unsettled > 0) throw commerceConflict("PAYMENT_NOT_RESOLVED", "Payment is still being confirmed. Check its status before cancelling the order.");
      const now = new Date();
      const changed = await tx.order.updateMany({ where: { id: order.id, status: order.status, paymentStatus: OrderPaymentStatus.UNPAID }, data: { status: OrderStatus.CANCELLED, cancelledAt: now } });
      if (changed.count !== 1) return;
      await tx.supplierOrder.updateMany({ where: { orderId: order.id, status: SupplierOrderStatus.PENDING_PAYMENT }, data: { status: SupplierOrderStatus.CANCELLED } });
      const supplierOrders = await tx.supplierOrder.findMany({ where: { orderId: order.id }, select: { id: true } });
      await tx.supplierOrderStatusHistory.createMany({ data: supplierOrders.map((row) => ({ supplierOrderId: row.id, previousStatus: SupplierOrderStatus.PENDING_PAYMENT, newStatus: SupplierOrderStatus.CANCELLED, actorUserId: userId, reason: dto.reason, publicMessage: "Supplier order cancelled" })) });
      await this.inventory.releaseOwned(tx, order.id, now);
      await this.restoreCartAfterCancellation(tx, order.checkoutAttemptId, profile.id);
      await tx.orderStatusHistory.create({ data: { orderId: order.id, previousStatus: order.status, newStatus: OrderStatus.CANCELLED, actorUserId: userId, reason: dto.reason, publicMessage: "Order cancelled" } });
      await this.outbox.enqueue(tx, { eventType: "ORDER_CANCELLED", aggregateType: "Order", aggregateId: order.id, dedupeKey: `order:${order.id}:cancelled`, userId, payload: { recipientUserId: userId, type: "ORDER_CANCELLED", category: "ORDER", title: "Order cancelled", body: "Your unpaid order was cancelled.", entityType: "ORDER", entityId: order.id, dedupeKey: `notification:order:${order.id}:cancelled` } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return this.get(userId, orderId);
  }

  private async supplierForOrganization(userId: string, organizationId: string) {
    await this.rbac.organizationContext(userId, organizationId, "orders.read");
    const supplier = await this.prisma.supplier.findUnique({ where: { organizationId } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return supplier;
  }

  async supplierOrders(userId: string, organizationId: string) {
    const supplier = await this.supplierForOrganization(userId, organizationId);
    const rows = await this.prisma.supplierOrder.findMany({ where: { supplierId: supplier.id }, include: { items: true, statusHistory: { orderBy: { createdAt: "asc" } }, order: { select: { orderNumber: true, status: true, paymentStatus: true, fulfillmentMethod: true, pickupSnapshot: true, deliveryAddress: true, createdAt: true } } }, orderBy: { createdAt: "desc" } });
    return rows.map((row) => ({ ...row, subtotal: row.subtotal.toFixed(2), items: row.items.map((item) => ({ ...item, unitPrice: item.unitPrice.toFixed(2), lineTotal: item.lineTotal.toFixed(2) })) }));
  }

  async supplierOrder(userId: string, organizationId: string, supplierOrderId: string) {
    const supplier = await this.supplierForOrganization(userId, organizationId);
    const row = await this.prisma.supplierOrder.findFirst({ where: { id: supplierOrderId, supplierId: supplier.id }, include: { items: true, statusHistory: { orderBy: { createdAt: "asc" } }, order: { select: { orderNumber: true, status: true, paymentStatus: true, fulfillmentMethod: true, pickupSnapshot: true, deliveryAddress: true, createdAt: true } } } });
    if (!row) throw new NotFoundException("Supplier order not found");
    return { ...row, subtotal: row.subtotal.toFixed(2), items: row.items.map((item) => ({ ...item, unitPrice: item.unitPrice.toFixed(2), lineTotal: item.lineTotal.toFixed(2) })) };
  }

  async platformOrders(userId: string) {
    await this.rbac.requirePlatform(userId, "platform.orders.read");
    return (await this.prisma.order.findMany({ include: { supplierOrders: true }, orderBy: { createdAt: "desc" } })).map((order) => this.output(order));
  }

  async platformOrder(userId: string, orderId: string) {
    await this.rbac.requirePlatform(userId, "platform.orders.read");
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!order) throw new NotFoundException("Order not found");
    return this.output(order);
  }
}

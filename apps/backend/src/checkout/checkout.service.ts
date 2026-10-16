import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CartStatus, CheckoutAttemptStatus, FulfillmentMethod, OrderPaymentStatus, OrderStatus, Prisma, SupplierOrderStatus } from "@prisma/client";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { CommercialAvailabilityService } from "../commerce/commercial-availability.service";
import { commerceConflict } from "../commerce/commerce-error";
import { CustomerService } from "../customer/customer.service";
import { InventoryService } from "../inventory/inventory.service";
import { DeliveryZoneResolver } from "../delivery/delivery-zone-resolver.service";
import { PrismaService } from "../prisma/prisma.service";
import { PrepareCheckoutDto } from "./dto/checkout.dto";
import { OperationalOutboxService } from "../operations/operations.service";

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customer: CustomerService,
    private readonly availability: CommercialAvailabilityService,
    private readonly inventory: InventoryService,
    private readonly config: ConfigService,
    private readonly deliveryZones: DeliveryZoneResolver,
    private readonly outbox: OperationalOutboxService,
  ) {}

  private orderNumber(prefix = "EC") {
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return `${prefix}-${date}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  }

  private collectionCode(orderId: string) { const secret = this.config.getOrThrow<string>("COLLECTION_CODE_SECRET"); return (BigInt(`0x${createHmac("sha256", secret).update(`collection:${orderId}`).digest("hex").slice(0, 16)}`) % 100000000n).toString().padStart(8, "0"); }
  private summary(order: { id: string; orderNumber: string; status: OrderStatus; paymentStatus: OrderPaymentStatus; currencyCode: string; subtotal: Prisma.Decimal; deliveryFee: Prisma.Decimal; pickupFee: Prisma.Decimal; total: Prisma.Decimal; fulfillmentMethod: FulfillmentMethod; createdAt: Date; supplierOrders?: unknown[] }) {
    return { orderId: order.id, orderNumber: order.orderNumber, status: order.status, paymentStatus: order.paymentStatus, fulfillmentMethod: order.fulfillmentMethod, currencyCode: order.currencyCode, subtotal: order.subtotal.toFixed(2), deliveryFee: order.deliveryFee.toFixed(2), pickupFee: order.pickupFee.toFixed(2), total: order.total.toFixed(2), deliveryQuoteRequired: order.status === OrderStatus.AWAITING_DELIVERY_QUOTE, ...(order.fulfillmentMethod === FulfillmentMethod.PICKUP ? { collectionCode: this.collectionCode(order.id) } : {}), supplierOrderCount: order.supplierOrders?.length ?? 0, createdAt: order.createdAt };
  }

  private availablePaymentMethods(currencyCode: string) {
    return ["CARD", ...(currencyCode === "KES" && this.config.get<boolean>("PAYSTACK_MPESA_ENABLED", false) ? ["MPESA"] : [])];
  }

  private assertFulfillment(dto: PrepareCheckoutDto) {
    if (dto.fulfillmentMethod === FulfillmentMethod.DELIVERY && !dto.addressId) throw new BadRequestException("addressId is required for delivery");
    if (dto.fulfillmentMethod === FulfillmentMethod.PICKUP && !dto.pickupPointId) throw new BadRequestException("pickupPointId is required for pickup");
    if (dto.fulfillmentMethod === FulfillmentMethod.DELIVERY && dto.pickupPointId) throw new BadRequestException("pickupPointId is invalid for delivery");
    if (dto.fulfillmentMethod === FulfillmentMethod.PICKUP && dto.addressId) throw new BadRequestException("addressId is invalid for pickup");
  }

  async preview(userId: string, dto: PrepareCheckoutDto) {
    this.assertFulfillment(dto);
    const profile = await this.customer.ensureCustomerProfile(userId);
    return this.prisma.$transaction(async tx => {
      const cart = await tx.cart.findFirst({ where: { customerProfileId: profile.id, status: CartStatus.ACTIVE }, include: { items: { orderBy: { supplierListingId: "asc" } } } });
      if (!cart || !cart.items.length || !cart.currencyCode) throw new BadRequestException("Active cart is empty");
      const address = dto.fulfillmentMethod === FulfillmentMethod.DELIVERY ? await tx.customerAddress.findFirst({ where: { id: dto.addressId!, customerProfileId: profile.id } }) : null;
      if (dto.fulfillmentMethod === FulfillmentMethod.DELIVERY && !address) throw new BadRequestException("Delivery address is invalid");
      const pickupPoint = dto.fulfillmentMethod === FulfillmentMethod.PICKUP ? await tx.pickupPoint.findFirst({ where: { id: dto.pickupPointId!, status: "ACTIVE" } }) : null;
      if (dto.fulfillmentMethod === FulfillmentMethod.PICKUP && !pickupPoint) throw new BadRequestException("Pickup point is invalid or inactive");
      let subtotal = new Prisma.Decimal(0);
      for (const item of cart.items) {
        const commercial = await this.availability.resolve(item.supplierListingId, tx);
        if (!commercial?.eligible) throw commerceConflict("LISTING_UNAVAILABLE", "A cart listing is no longer available");
        if (!commercial.currentPrice.equals(item.unitPriceSnapshot)) throw commerceConflict("PRICE_CHANGED", "A cart price changed; refresh the cart before retrying checkout");
        if (commercial.currencyCode !== cart.currencyCode || commercial.currencyCode !== item.currencyCode) throw commerceConflict("CART_CURRENCY_MISMATCH", "Cart currency is inconsistent");
        if (commercial.availableQuantity < item.quantity) throw commerceConflict("INSUFFICIENT_STOCK", "A cart quantity is no longer available");
        subtotal = subtotal.plus(commercial.currentPrice.mul(item.quantity));
      }
      const automatic = address ? await this.deliveryZones.resolve(address, cart.currencyCode, tx) : null;
      const deliveryFee = automatic?.rate.amount ?? new Prisma.Decimal(0);
      const pickupFee = pickupPoint?.pickupFee ?? new Prisma.Decimal(0);
      const deliveryQuoteRequired = Boolean(address && !automatic);
      return { currencyCode: cart.currencyCode, subtotal: subtotal.toFixed(2), deliveryFee: deliveryFee.toFixed(2), pickupFee: pickupFee.toFixed(2), total: subtotal.plus(deliveryFee).plus(pickupFee).toFixed(2), deliveryQuoteRequired, availablePaymentMethods: this.availablePaymentMethods(cart.currencyCode) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async prepare(userId: string, idempotencyKey: string | undefined, dto: PrepareCheckoutDto) {
    const key = idempotencyKey?.trim();
    if (!key || key.length > 200) throw new BadRequestException("A valid Idempotency-Key header is required");
    this.assertFulfillment(dto);
    const profile = await this.customer.ensureCustomerProfile(userId);
    const existing = await this.prisma.order.findFirst({ where: { customerProfileId: profile.id, checkoutAttempt: { idempotencyKey: key } }, include: { supplierOrders: true } });
    if (existing) return this.summary(existing);

    for (let attemptNumber = 0; attemptNumber < 3; attemptNumber += 1) {
      try {
        const order = await this.prisma.$transaction(async (tx) => {
          const alreadyCreated = await tx.order.findFirst({ where: { customerProfileId: profile.id, checkoutAttempt: { idempotencyKey: key } }, include: { supplierOrders: true } });
          if (alreadyCreated) return alreadyCreated;
          const cart = await tx.cart.findFirst({ where: { customerProfileId: profile.id, status: CartStatus.ACTIVE }, include: { items: { orderBy: { supplierListingId: "asc" } } } });
          if (!cart || cart.items.length === 0) throw new BadRequestException("Active cart is empty");
          const address = dto.fulfillmentMethod === FulfillmentMethod.DELIVERY ? await tx.customerAddress.findFirst({ where: { id: dto.addressId!, customerProfileId: profile.id } }) : null;
          if (dto.fulfillmentMethod === FulfillmentMethod.DELIVERY && !address) throw new BadRequestException("Delivery address is invalid");
          const pickupPoint = dto.fulfillmentMethod === FulfillmentMethod.PICKUP ? await tx.pickupPoint.findFirst({ where: { id: dto.pickupPointId!, status: "ACTIVE" } }) : null;
          if (dto.fulfillmentMethod === FulfillmentMethod.PICKUP && !pickupPoint) throw new BadRequestException("Pickup point is invalid or inactive");
          const checkoutAttempt = await tx.checkoutAttempt.create({ data: { customerProfileId: profile.id, cartId: cart.id, idempotencyKey: key } });

          const validated: Array<{ item: typeof cart.items[number]; commercial: NonNullable<Awaited<ReturnType<CommercialAvailabilityService["resolve"]>>>; lineTotal: Prisma.Decimal }> = [];
          let subtotal = new Prisma.Decimal(0);
          for (const item of cart.items) {
            const commercial = await this.availability.resolve(item.supplierListingId, tx);
            if (!commercial?.eligible) throw commerceConflict("LISTING_UNAVAILABLE", "A cart listing is no longer available");
            if (!commercial.currentPrice.equals(item.unitPriceSnapshot)) throw commerceConflict("PRICE_CHANGED", "A cart price changed; refresh the cart before retrying checkout");
            if (commercial.currencyCode !== cart.currencyCode || commercial.currencyCode !== item.currencyCode) throw commerceConflict("CART_CURRENCY_MISMATCH", "Cart currency is inconsistent");
            if (commercial.availableQuantity < item.quantity) throw commerceConflict("INSUFFICIENT_STOCK", "A cart quantity is no longer available");
            const lineTotal = commercial.currentPrice.mul(item.quantity);
            subtotal = subtotal.plus(lineTotal);
            validated.push({ item, commercial, lineTotal });
          }

          const automatic = address ? await this.deliveryZones.resolve(address, cart.currencyCode!, tx) : null;
          const deliveryFee = automatic?.rate.amount ?? new Prisma.Decimal(0);
          const pickupFee = pickupPoint?.pickupFee ?? new Prisma.Decimal(0);
          const status = address && !automatic ? OrderStatus.AWAITING_DELIVERY_QUOTE : OrderStatus.PENDING_PAYMENT;
          const order = await tx.order.create({ data: { orderNumber: this.orderNumber(), customerProfileId: profile.id, checkoutAttemptId: checkoutAttempt.id, status, currencyCode: cart.currencyCode!, subtotal, deliveryFee, pickupFee, total: subtotal.plus(deliveryFee).plus(pickupFee), fulfillmentMethod: dto.fulfillmentMethod } });
          if (address) await tx.orderDeliveryAddress.create({ data: { orderId: order.id, recipientName: address.recipientName, phone: address.phone, alternativePhone: address.alternativePhone, countryCode: address.countryCode, region: address.region, city: address.city, estate: address.estate, street: address.street, building: address.building, houseNumber: address.houseNumber, landmark: address.landmark, latitude: address.latitude, longitude: address.longitude, deliveryNotes: address.deliveryNotes } });
          if (pickupPoint) { const code = this.collectionCode(order.id); await tx.order.update({ where: { id: order.id }, data: { collectionCodeHash: createHash("sha256").update(code).digest("hex") } }); await tx.orderPickupSnapshot.create({ data: { orderId: order.id, pickupPointId: pickupPoint.id, name: pickupPoint.name, address: pickupPoint.address, city: pickupPoint.city, region: pickupPoint.region, phone: pickupPoint.phone, pickupFee: pickupPoint.pickupFee } }); }
          if (address && !automatic) await tx.deliveryQuote.create({ data: { orderId: order.id, currencyCode: cart.currencyCode! } });

          const supplierGroups = new Map<string, typeof validated>();
          for (const line of validated) {
            const supplierId = line.commercial.listing.supplierId;
            supplierGroups.set(supplierId, [...(supplierGroups.get(supplierId) ?? []), line]);
          }
          const supplierOrders = new Map<string, string>();
          for (const [supplierId, lines] of supplierGroups) {
            const supplierSubtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
            const supplierOrder = await tx.supplierOrder.create({ data: { orderId: order.id, supplierId, supplierOrderNumber: this.orderNumber("SO"), status: SupplierOrderStatus.PENDING_PAYMENT, subtotal: supplierSubtotal } });
            await tx.supplierOrderStatusHistory.create({ data: { supplierOrderId: supplierOrder.id, previousStatus: null, newStatus: SupplierOrderStatus.PENDING_PAYMENT, actorUserId: userId, publicMessage: "Supplier order created and awaiting payment" } });
            supplierOrders.set(supplierId, supplierOrder.id);
          }
          for (const line of validated) {
            const listing = line.commercial.listing;
            await tx.orderItem.create({ data: { orderId: order.id, supplierOrderId: supplierOrders.get(listing.supplierId)!, supplierId: listing.supplierId, supplierListingId: listing.id, productId: listing.productId, productVariantId: listing.productVariantId, productNameSnapshot: listing.product.name, variantNameSnapshot: listing.productVariant?.name, supplierNameSnapshot: listing.supplier.displayName, supplierSkuSnapshot: listing.supplierSku, quantity: line.item.quantity, unitPrice: listing.price, lineTotal: line.lineTotal, currencyCode: listing.currencyCode, warrantyDaysSnapshot: listing.warrantyDays } });
          }

          const ttlMinutes = this.config.get<number>("CHECKOUT_RESERVATION_TTL_MINUTES", 15);
          const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
          for (const line of validated) await this.inventory.allocateOwned(tx, line.item.supplierListingId, line.item.quantity, checkoutAttempt.id, order.id, expiresAt);
          await tx.orderStatusHistory.create({ data: { orderId: order.id, previousStatus: null, newStatus: status, actorUserId: userId, publicMessage: status === OrderStatus.AWAITING_DELIVERY_QUOTE ? "Order created and awaiting a delivery quote" : "Order created and awaiting payment" } });
          const converted = await tx.cart.updateMany({ where: { id: cart.id, status: CartStatus.ACTIVE }, data: { status: CartStatus.CONVERTED } });
          if (converted.count !== 1) throw commerceConflict("CHECKOUT_ALREADY_TERMINAL", "Cart has already been converted");
          await tx.checkoutAttempt.update({ where: { id: checkoutAttempt.id }, data: { status: CheckoutAttemptStatus.ORDER_CREATED } });
          await this.outbox.enqueue(tx, { eventType: "ORDER_CREATED", aggregateType: "Order", aggregateId: order.id, dedupeKey: `order:${order.id}:created`, userId, payload: { recipientUserId: userId, type: "ORDER_CREATED", category: "ORDER", title: "Order created", body: `Order ${order.orderNumber} was created.`, entityType: "ORDER", entityId: order.id, dedupeKey: `notification:order:${order.id}:created` } });
          if (status === OrderStatus.PENDING_PAYMENT) await this.outbox.enqueue(tx, { eventType: "PAYMENT_REQUIRED", aggregateType: "Order", aggregateId: order.id, dedupeKey: `order:${order.id}:payment-required`, userId, payload: { recipientUserId: userId, type: "PAYMENT_REQUIRED", category: "PAYMENT", title: "Payment required", body: `Payment is required for order ${order.orderNumber}.`, entityType: "ORDER", entityId: order.id, dedupeKey: `notification:order:${order.id}:payment-required` } });
          return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { supplierOrders: true } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
        return this.summary(order);
      } catch (error) {
        const prismaError = error as { code?: string; meta?: { code?: string } };
        const code = prismaError.code;
        if ((code === "P2034" || (code === "P2010" && prismaError.meta?.code === "40001")) && attemptNumber < 2) continue;
        if (code === "P2002") {
          const repeated = await this.prisma.order.findFirst({ where: { customerProfileId: profile.id, checkoutAttempt: { idempotencyKey: key } }, include: { supplierOrders: true } });
          if (repeated) return this.summary(repeated);
        }
        throw error;
      }
    }
    throw commerceConflict("CHECKOUT_ALREADY_TERMINAL", "Checkout could not be completed");
  }
}

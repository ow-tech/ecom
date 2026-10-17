import { Injectable, NotFoundException } from "@nestjs/common";
import { CartStatus, Prisma } from "@prisma/client";
import { CommercialAvailabilityService } from "../commerce/commercial-availability.service";
import { commerceConflict } from "../commerce/commerce-error";
import { CustomerService } from "../customer/customer.service";
import { PrismaService } from "../prisma/prisma.service";
import { AddCartItemDto, UpdateCartItemDto } from "./dto/cart.dto";

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customer: CustomerService,
    private readonly availability: CommercialAvailabilityService,
  ) {}

  private async activeCart(customerProfileId: string) {
    const existing = await this.prisma.cart.findFirst({ where: { customerProfileId, status: CartStatus.ACTIVE } });
    if (existing) return existing;
    try {
      return await this.prisma.cart.create({ data: { customerProfileId } });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      return this.prisma.cart.findFirstOrThrow({ where: { customerProfileId, status: CartStatus.ACTIVE } });
    }
  }

  private async output(cartId: string) {
    const cart = await this.prisma.cart.findUniqueOrThrow({ where: { id: cartId }, include: { items: { orderBy: { createdAt: "asc" } } } });
    const items = await Promise.all(cart.items.map(async (item) => {
      const commercial = await this.availability.resolve(item.supplierListingId);
      return {
        id: item.id,
        supplierListingId: item.supplierListingId,
        quantity: item.quantity,
        unitPriceSnapshot: item.unitPriceSnapshot.toFixed(2),
        currencyCode: item.currencyCode,
        currentPrice: commercial?.currentPrice.toFixed(2) ?? null,
        currentAvailability: commercial?.availableQuantity ?? 0,
        origin: commercial?.listing.origin ?? "LOCAL",
        deliveryMinDays: commercial?.listing.deliveryMinDays ?? null,
        deliveryMaxDays: commercial?.listing.deliveryMaxDays ?? null,
        eligible: commercial?.eligible ?? false,
        productName: commercial?.listing.product.name ?? null,
        productSlug: commercial?.listing.product.slug ?? null,
        variantName: commercial?.listing.productVariant?.name ?? null,
        supplierDisplayName: commercial?.listing.supplier.displayName ?? null,
        primaryImage: commercial?.listing.product.media[0] ?? null,
      };
    }));
    const subtotal = cart.items.reduce((sum, item) => sum.plus(item.unitPriceSnapshot.mul(item.quantity)), new Prisma.Decimal(0));
    return { id: cart.id, status: cart.status, currencyCode: cart.currencyCode, subtotal: subtotal.toFixed(2), items };
  }

  async get(userId: string) {
    const profile = await this.customer.ensureCustomerProfile(userId);
    return this.output((await this.activeCart(profile.id)).id);
  }

  async add(userId: string, dto: AddCartItemDto) {
    const profile = await this.customer.ensureCustomerProfile(userId);
    const cart = await this.activeCart(profile.id);
    await this.serializable(async (tx) => {
      const commercial = await this.availability.resolve(dto.supplierListingId, tx);
      if (!commercial?.eligible) throw commerceConflict("LISTING_UNAVAILABLE", "Listing is not available for purchase");
      const current = await tx.cartItem.findUnique({ where: { cartId_supplierListingId: { cartId: cart.id, supplierListingId: dto.supplierListingId } } });
      const quantity = (current?.quantity ?? 0) + dto.quantity;
      if (commercial.availableQuantity < quantity) throw commerceConflict("INSUFFICIENT_STOCK", "Requested quantity is unavailable");
      const currentCart = await tx.cart.findUniqueOrThrow({ where: { id: cart.id } });
      if (currentCart.currencyCode && currentCart.currencyCode !== commercial.currencyCode) throw commerceConflict("CART_CURRENCY_MISMATCH", "Cart cannot contain mixed currencies");
      if (!currentCart.currencyCode) await tx.cart.update({ where: { id: cart.id }, data: { currencyCode: commercial.currencyCode } });
      await tx.cartItem.upsert({
        where: { cartId_supplierListingId: { cartId: cart.id, supplierListingId: dto.supplierListingId } },
        create: { cartId: cart.id, supplierListingId: dto.supplierListingId, quantity, unitPriceSnapshot: commercial.currentPrice, currencyCode: commercial.currencyCode },
        update: { quantity, unitPriceSnapshot: commercial.currentPrice, currencyCode: commercial.currencyCode },
      });
    });
    return this.output(cart.id);
  }

  async update(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const profile = await this.customer.ensureCustomerProfile(userId);
    const cart = await this.activeCart(profile.id);
    await this.serializable(async (tx) => {
      const item = await tx.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
      if (!item) throw new NotFoundException("Cart item not found");
      const commercial = await this.availability.resolve(item.supplierListingId, tx);
      if (!commercial?.eligible) throw commerceConflict("LISTING_UNAVAILABLE", "Listing is not available for purchase");
      if (commercial.availableQuantity < dto.quantity) throw commerceConflict("INSUFFICIENT_STOCK", "Requested quantity is unavailable");
      await tx.cartItem.update({ where: { id: item.id }, data: { quantity: dto.quantity, unitPriceSnapshot: commercial.currentPrice, currencyCode: commercial.currencyCode } });
    });
    return this.output(cart.id);
  }

  async remove(userId: string, itemId: string) {
    const profile = await this.customer.ensureCustomerProfile(userId);
    const cart = await this.activeCart(profile.id);
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
      if (!item) throw new NotFoundException("Cart item not found");
      await tx.cartItem.delete({ where: { id: item.id } });
      if (await tx.cartItem.count({ where: { cartId: cart.id } }) === 0) await tx.cart.update({ where: { id: cart.id }, data: { currencyCode: null } });
    });
    return this.output(cart.id);
  }

  async clear(userId: string) {
    const profile = await this.customer.ensureCustomerProfile(userId);
    const cart = await this.activeCart(profile.id);
    await this.prisma.$transaction([this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } }), this.prisma.cart.update({ where: { id: cart.id }, data: { currencyCode: null } })]);
    return this.output(cart.id);
  }

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try { return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) { if ((error as { code?: string }).code !== "P2034" || attempt >= 2) throw error; }
    }
  }
}

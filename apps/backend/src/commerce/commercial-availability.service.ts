import { Injectable } from "@nestjs/common";
import { Prisma, ProductStatus, ProductVariantStatus, SupplierListingStatus, SupplierStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type Database = Prisma.TransactionClient | PrismaService;

@Injectable()
export class CommercialAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(supplierListingId: string, database?: Database) {
    const db = database ?? this.prisma;
    const listing = await db.supplierListing.findUnique({
      where: { id: supplierListingId },
      include: {
        supplier: true,
        product: { include: { media: { orderBy: { sortOrder: "asc" }, take: 1 } } },
        productVariant: true,
        inventoryItems: { where: { inventoryLocation: { status: "ACTIVE" } }, select: { onHand: true, reserved: true } },
      },
    });
    if (!listing) return null;
    const eligible = listing.status === SupplierListingStatus.ACTIVE
      && listing.supplier.status === SupplierStatus.ACTIVE
      && listing.product.status === ProductStatus.ACTIVE
      && (!listing.productVariant || listing.productVariant.status === ProductVariantStatus.ACTIVE);
    const availableQuantity = listing.inventoryItems.reduce((total, item) => total + item.onHand - item.reserved, 0);
    return {
      eligible,
      currentPrice: listing.price,
      currencyCode: listing.currencyCode,
      availableQuantity,
      listing,
    };
  }
}

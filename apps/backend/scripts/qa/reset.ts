import { PrismaClient } from "@prisma/client";
import { assertQaEnvironment } from "./guard";

assertQaEnvironment(false);
if (process.env.QA_RESET_CONFIRMATION !== "DELETE_QA_FIXTURES") throw new Error("Refusing QA reset: set QA_RESET_CONFIRMATION=DELETE_QA_FIXTURES");
const prisma = new PrismaClient();
async function main() {
  const commercialRows = await prisma.order.count({ where: { customerProfile: { user: { emailNormalized: { in: ["customer@gmail.com", "customer2@gmail.com"] } } } } });
  if (commercialRows) throw new Error("Refusing QA reset: QA orders exist and must be cancelled through canonical workflows first");
  await prisma.$transaction(async tx => {
    await tx.inventoryMovement.deleteMany({ where: { inventoryItem: { supplierListing: { supplierSku: { startsWith: "QA-" } } } } });
    await tx.inventoryItem.deleteMany({ where: { supplierListing: { supplierSku: { startsWith: "QA-" } } } });
    await tx.supplierListing.deleteMany({ where: { supplierSku: { startsWith: "QA-" } } });
    await tx.productMedia.deleteMany({ where: { product: { slug: { startsWith: "qa-" } } } });
    await tx.productVariant.deleteMany({ where: { product: { slug: { startsWith: "qa-" } } } });
    await tx.product.deleteMany({ where: { slug: { startsWith: "qa-" } } });
    await tx.deliveryRate.deleteMany({ where: { id: "00000000-0000-4000-8000-000000000002" } });
    await tx.deliveryZone.deleteMany({ where: { id: "00000000-0000-4000-8000-000000000001" } });
    await tx.pickupPoint.deleteMany({ where: { code: { startsWith: "QA-" } } });
    await tx.category.deleteMany({ where: { slug: { startsWith: "qa-" } } });
    await tx.inventoryLocation.deleteMany({ where: { code: { startsWith: "QA-" } } });
    await tx.supplier.deleteMany({ where: { slug: { startsWith: "qa-" } } });
    await tx.organization.deleteMany({ where: { slug: { startsWith: "qa-" } } });
    await tx.user.deleteMany({ where: { displayName: { startsWith: "QA " } } });
  });
  console.log("QA fixtures removed");
}
main().finally(() => prisma.$disconnect());

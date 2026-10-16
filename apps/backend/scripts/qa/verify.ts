import * as argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { assertQaEnvironment } from "./guard";

assertQaEnvironment();
const prisma = new PrismaClient();
const emails = ["admin@gmail.com", "customer@gmail.com", "supplier@gmail.com", "inventory.staff@gmail.com"];
async function main() {
  const users = await prisma.user.findMany({ where: { emailNormalized: { in: emails } }, include: { credential: true } });
  if (users.some(user => user.accountAudience !== (user.emailNormalized.startsWith("customer") ? "CUSTOMER" : "WORKFORCE"))) throw new Error("QA account-audience separation failed");
  if (users.length !== emails.length || users.some(user => !user.credential)) throw new Error("QA account fixture is incomplete");
  if (!(await Promise.all(users.map(user => argon2.verify(user.credential!.passwordHash, process.env.QA_SEED_PASSWORD!)))).every(Boolean)) throw new Error("QA password verification failed");
  const [categories, products, listings, inventory, suppliers, pickupPoints, profiles] = await Promise.all([
    prisma.category.count({ where: { slug: { startsWith: "qa-" } } }), prisma.product.count({ where: { slug: { startsWith: "qa-" } } }), prisma.supplierListing.count({ where: { supplierSku: { startsWith: "QA-" } } }), prisma.inventoryItem.count({ where: { supplierListing: { supplierSku: { startsWith: "QA-" } } } }), prisma.supplier.count({ where: { slug: { startsWith: "qa-" }, status: "ACTIVE" } }), prisma.pickupPoint.count({ where: { code: { startsWith: "QA-" }, status: "ACTIVE" } }), prisma.customerProfile.count({ where: { user: { emailNormalized: { in: ["customer@gmail.com", "customer2@gmail.com"] } } } }),
  ]);
  if (categories < 10 || products < 20 || listings < 25 || suppliers !== 2 || pickupPoints < 3 || profiles !== 2) throw new Error("QA coverage is incomplete");
  const invalidInventory = await prisma.inventoryItem.count({ where: { supplierListing: { supplierSku: { startsWith: "QA-" } }, OR: [{ onHand: { lt: 0 } }, { reserved: { lt: 0 } }] } });
  if (invalidInventory) throw new Error("QA inventory invariant failed");
  console.log(JSON.stringify({ users: users.length, categories, products, listings, inventory, suppliers, pickupPoints, customerProfiles: profiles, orders: 0, note: "orders/payment/returns are intentionally created only through canonical runtime workflows" }));
}
main().finally(() => prisma.$disconnect());

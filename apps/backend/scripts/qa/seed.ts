import * as argon2 from "argon2";
import { PrismaClient, ProductStatus, RoleScope, SupplierListingStatus, SupplierStatus } from "@prisma/client";
import { assertQaEnvironment } from "./guard";

assertQaEnvironment();
const prisma = new PrismaClient();
const password = process.env.QA_SEED_PASSWORD!;

const users = [
  ["admin@gmail.com", "QA Platform Super Admin"], ["operations@gmail.com", "QA Platform Operations Admin"],
  ["catalogue.admin@gmail.com", "QA Platform Catalogue Admin"], ["support.admin@gmail.com", "QA Platform Support Admin"],
  ["customer@gmail.com", "QA Customer One"], ["customer2@gmail.com", "QA Customer Two"],
  ["supplier@gmail.com", "QA Supplier A Owner"], ["supplier2@gmail.com", "QA Supplier B Owner"],
  ["inventory.staff@gmail.com", "QA Supplier A Inventory Staff"], ["orders.staff@gmail.com", "QA Supplier A Orders Staff"],
  ["finance.staff@gmail.com", "QA Supplier A Finance Viewer"], ["supplier.support@gmail.com", "QA Supplier A Support Staff"],
] as const;

const categories = ["Technology", "Mobile Phones", "Computers & Accessories", "Home & Kitchen", "Fashion & Clothing", "Beauty & Personal Care", "Health & Wellness", "Sports & Outdoors", "Baby & Kids", "Office & Stationery"] as const;
const products = [
  ["6.5-inch Android Smartphone", "Mobile Phones", "128GB / Black", "256GB / Blue"], ["20,000mAh Power Bank", "Technology"], ["Wireless Bluetooth Earbuds", "Technology"], ["14-inch Business Laptop", "Computers & Accessories", "16GB RAM / 512GB SSD", "32GB RAM / 1TB SSD"], ["Wireless Computer Mouse", "Computers & Accessories"], ["Mechanical Keyboard", "Computers & Accessories"], ["1.5L Electric Blender", "Home & Kitchen"], ["LED Desk Lamp", "Home & Kitchen"], ["Stainless Steel Coffee Maker", "Home & Kitchen"], ["Everyday Canvas Tote Bag", "Fashion & Clothing"], ["Casual Running Sneakers", "Fashion & Clothing", "Size 40", "Size 41", "Size 42"], ["Cotton Hoodie", "Fashion & Clothing", "Small", "Medium", "Large"], ["Daily Moisturizing Body Lotion", "Beauty & Personal Care"], ["Makeup Brush Set", "Beauty & Personal Care"], ["Non-slip Yoga Mat", "Health & Wellness", "Blue", "Green"], ["Insulated Reusable Water Bottle", "Health & Wellness", "500ml", "750ml"], ["Swimming Goggles", "Sports & Outdoors"], ["Training Football", "Sports & Outdoors"], ["Multifunctional Diaper Bag", "Baby & Kids"], ["A5 Hardcover Notebook Set", "Office & Stationery"],
] as const;
const catalogueDetails: Record<string, { brand: string; description: string; imageUrl: string }> = {
  "6.5-inch Android Smartphone": { brand: "Nuru Mobile", description: "A bright 6.5-inch everyday smartphone with dependable all-day battery life, a dual-camera setup, and generous storage for photos, payments, and streaming.", imageUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1200&q=85" },
  "20,000mAh Power Bank": { brand: "Kifaru Tech", description: "A high-capacity travel power bank with dual USB outputs, a clear battery indicator, and enough reserve for long commutes or weekend trips.", imageUrl: "https://images.unsplash.com/photo-1609592424843-3d8f7b4f1b1e?auto=format&fit=crop&w=1200&q=85" },
  "Wireless Bluetooth Earbuds": { brand: "Kifaru Tech", description: "Compact true-wireless earbuds with a pocket charging case, balanced sound for calls and music, and touch controls for everyday listening.", imageUrl: "https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=1200&q=85" },
  "14-inch Business Laptop": { brand: "Nuru Computing", description: "A portable 14-inch work laptop designed for documents, video calls, research, and smooth multitasking, with a comfortable keyboard and fast solid-state storage.", imageUrl: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1200&q=85" },
  "Wireless Computer Mouse": { brand: "Nuru Computing", description: "A quiet wireless mouse with a comfortable ambidextrous shape, precise optical tracking, and a battery-saving sleep mode for desk or travel use.", imageUrl: "https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=1200&q=85" },
  "Mechanical Keyboard": { brand: "Nuru Computing", description: "A sturdy tenkeyless mechanical keyboard with tactile switches, a compact layout, and durable keycaps for writing, coding, and study.", imageUrl: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=1200&q=85" },
  "1.5L Electric Blender": { brand: "Jikoni Home", description: "A practical 1.5-litre countertop blender for smoothies, sauces, soups, and family-size preparation, with a sturdy glass jug and easy-clean controls.", imageUrl: "https://images.unsplash.com/photo-1570222094114-d054a817e56b?auto=format&fit=crop&w=1200&q=85" },
  "LED Desk Lamp": { brand: "Jikoni Home", description: "An adjustable LED desk lamp with a focused reading beam, flexible neck, and low-heat light for homework, office work, or bedside reading.", imageUrl: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=85" },
  "Stainless Steel Coffee Maker": { brand: "Jikoni Home", description: "A compact stainless-steel coffee maker for smooth morning brews, with a reusable filter basket and a footprint that suits small kitchens and offices.", imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=85" },
  "Everyday Canvas Tote Bag": { brand: "Mavazi Studio", description: "A roomy reusable canvas tote with reinforced handles and an easy-clean interior for groceries, books, work essentials, and everyday errands.", imageUrl: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1200&q=85" },
  "Casual Running Sneakers": { brand: "Mavazi Studio", description: "Lightweight everyday running sneakers with cushioned soles, breathable panels, and a flexible fit for walks, commutes, and beginner training.", imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=85" },
  "Cotton Hoodie": { brand: "Mavazi Studio", description: "A soft mid-weight cotton-blend hoodie with a lined hood, ribbed cuffs, and a relaxed fit for cool mornings and casual weekends.", imageUrl: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=1200&q=85" },
  "Daily Moisturizing Body Lotion": { brand: "Afya Care", description: "A gentle daily body lotion with a lightweight finish that helps keep skin comfortable and hydrated without a heavy, sticky feel.", imageUrl: "https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=1200&q=85" },
  "Makeup Brush Set": { brand: "Afya Care", description: "A practical brush set with soft synthetic bristles for foundation, blush, blending, and detail work, packed in a neat travel pouch.", imageUrl: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=1200&q=85" },
  "Non-slip Yoga Mat": { brand: "Afya Care", description: "A supportive textured yoga mat with a steady grip for stretching, mobility work, home workouts, and restorative practice.", imageUrl: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1200&q=85" },
  "Insulated Reusable Water Bottle": { brand: "Afya Care", description: "A double-wall insulated bottle that keeps drinks cool during commutes, workouts, and day trips, with a leak-resistant screw lid.", imageUrl: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1200&q=85" },
  "Swimming Goggles": { brand: "Safari Active", description: "Comfortable swim goggles with soft seals, adjustable straps, and clear lenses suited to pool training and relaxed weekend swims.", imageUrl: "https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=1200&q=85" },
  "Training Football": { brand: "Safari Active", description: "A durable training football with a balanced hand-stitched feel, designed for school grounds, community matches, and practice sessions.", imageUrl: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=85" },
  "Multifunctional Diaper Bag": { brand: "Little Steps", description: "A roomy diaper bag with organized bottle pockets, wipe access, and comfortable carry straps for day trips with a young family.", imageUrl: "https://images.unsplash.com/photo-1555252333-9f8e92e65df9?auto=format&fit=crop&w=1200&q=85" },
  "A5 Hardcover Notebook Set": { brand: "Paper & Grain", description: "A set of three A5 hardcover notebooks with smooth lined pages for meeting notes, study plans, journaling, and everyday lists.", imageUrl: "https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=1200&q=85" },
};
const slug = (value: string) => `qa-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
const galleryUrls = (url: string) => [
  url,
  url.replace("fit=crop&w=1200&q=85", "fit=crop&w=1200&h=1200&crop=top&q=85"),
  url.replace("fit=crop&w=1200&q=85", "fit=crop&w=1200&h=1200&crop=bottom&q=85"),
];

async function qaUser(email: string, displayName: string) {
  const existing = await prisma.user.findUnique({ where: { emailNormalized: email } });
  if (existing && !existing.displayName?.startsWith("QA ")) throw new Error(`Refusing to adopt non-QA account: ${email}`);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  return prisma.user.upsert({ where: { emailNormalized: email }, update: { displayName, status: "ACTIVE" }, create: { email, emailNormalized: email, displayName, status: "ACTIVE", credential: { create: { passwordHash } } } });
}

async function membership(userId: string, organizationId: string, roleKey: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  const row = await prisma.organizationMembership.upsert({ where: { organizationId_userId: { organizationId, userId } }, update: { status: "ACTIVE" }, create: { organizationId, userId, status: "ACTIVE" } });
  await prisma.membershipRole.upsert({ where: { membershipId_roleId: { membershipId: row.id, roleId: role.id } }, update: {}, create: { membershipId: row.id, roleId: role.id } });
}

async function main() {
  const qaUsers = Object.fromEntries(await Promise.all(users.map(async ([email, name]) => [email, await qaUser(email, name)] as const)));
  const platformRole = await prisma.role.findUniqueOrThrow({ where: { key: "platform.super_admin" } });
  for (const email of ["admin@gmail.com", "operations@gmail.com", "catalogue.admin@gmail.com", "support.admin@gmail.com"]) await prisma.platformRoleAssignment.upsert({ where: { userId_roleId: { userId: qaUsers[email].id, roleId: platformRole.id } }, update: {}, create: { userId: qaUsers[email].id, roleId: platformRole.id } });
  const supplierAOrg = await prisma.organization.upsert({ where: { slug: "qa-madina-tech-lifestyle" }, update: { name: "Madina Tech & Lifestyle", status: "ACTIVE" }, create: { name: "Madina Tech & Lifestyle", slug: "qa-madina-tech-lifestyle", status: "ACTIVE" } });
  const supplierBOrg = await prisma.organization.upsert({ where: { slug: "qa-nairobi-everyday-store" }, update: { name: "Nairobi Everyday Store", status: "ACTIVE" }, create: { name: "Nairobi Everyday Store", slug: "qa-nairobi-everyday-store", status: "ACTIVE" } });
  await membership(qaUsers["supplier@gmail.com"].id, supplierAOrg.id, "organization.owner"); await membership(qaUsers["supplier2@gmail.com"].id, supplierBOrg.id, "organization.owner");
  for (const email of ["inventory.staff@gmail.com", "orders.staff@gmail.com"]) await membership(qaUsers[email].id, supplierAOrg.id, "organization.admin");
  for (const email of ["finance.staff@gmail.com", "supplier.support@gmail.com"]) await membership(qaUsers[email].id, supplierAOrg.id, "organization.member");
  const supplierA = await prisma.supplier.upsert({ where: { organizationId: supplierAOrg.id }, update: { displayName: "Madina Tech & Lifestyle", status: SupplierStatus.ACTIVE, approvedByUserId: qaUsers["admin@gmail.com"].id, approvedAt: new Date() }, create: { organizationId: supplierAOrg.id, displayName: "Madina Tech & Lifestyle", legalName: "QA Madina Tech & Lifestyle", slug: "qa-madina-tech-lifestyle", description: "QA demonstration supplier.", businessEmail: "supplier@gmail.com", businessPhone: "+254700000001", countryCode: "KE", currencyCode: "KES", status: SupplierStatus.ACTIVE, approvedByUserId: qaUsers["admin@gmail.com"].id, approvedAt: new Date() } });
  const supplierB = await prisma.supplier.upsert({ where: { organizationId: supplierBOrg.id }, update: { displayName: "Nairobi Everyday Store", status: SupplierStatus.ACTIVE, approvedByUserId: qaUsers["admin@gmail.com"].id, approvedAt: new Date() }, create: { organizationId: supplierBOrg.id, displayName: "Nairobi Everyday Store", legalName: "QA Nairobi Everyday Store", slug: "qa-nairobi-everyday-store", description: "QA demonstration supplier.", businessEmail: "supplier2@gmail.com", businessPhone: "+254700000002", countryCode: "KE", currencyCode: "KES", status: SupplierStatus.ACTIVE, approvedByUserId: qaUsers["admin@gmail.com"].id, approvedAt: new Date() } });
  for (const supplier of [supplierA, supplierB]) await prisma.supplierStatusHistory.upsert({ where: { id: `${supplier.id}` }, update: {}, create: { supplierId: supplier.id, previousStatus: null, newStatus: "DRAFT", actorUserId: qaUsers["admin@gmail.com"].id } }).catch(() => undefined);
  const categoryRows = Object.fromEntries(await Promise.all(categories.map(async (name, index) => [name, await prisma.category.upsert({ where: { slug: slug(name) }, update: { name, description: `QA demonstration ${name} category.`, status: "ACTIVE", sortOrder: index }, create: { name, slug: slug(name), description: `QA demonstration ${name} category.`, status: "ACTIVE", sortOrder: index } })] as const)));
  const locations = await Promise.all([
    prisma.inventoryLocation.upsert({ where: { supplierId_code: { supplierId: supplierA.id, code: "QA-A-NRB-WH" } }, update: {}, create: { supplierId: supplierA.id, name: "QA Nairobi Warehouse", code: "QA-A-NRB-WH", type: "WAREHOUSE", city: "Nairobi", countryCode: "KE" } }),
    prisma.inventoryLocation.upsert({ where: { supplierId_code: { supplierId: supplierA.id, code: "QA-A-WEST-STORE" } }, update: {}, create: { supplierId: supplierA.id, name: "QA Westlands Store", code: "QA-A-WEST-STORE", type: "STORE", city: "Nairobi", countryCode: "KE" } }),
    prisma.inventoryLocation.upsert({ where: { supplierId_code: { supplierId: supplierB.id, code: "QA-B-NRB-WH" } }, update: {}, create: { supplierId: supplierB.id, name: "QA Nairobi Everyday Warehouse", code: "QA-B-NRB-WH", type: "WAREHOUSE", city: "Nairobi", countryCode: "KE" } }),
  ]);
  let listingOrdinal = 0;
  for (const [productOrdinal, [name, categoryName, ...variants]] of products.entries()) {
    const details = catalogueDetails[name];
    const product = await prisma.product.upsert({ where: { slug: slug(name) }, update: { name, categoryId: categoryRows[categoryName].id, brand: details.brand, description: details.description, status: ProductStatus.ACTIVE }, create: { name, slug: slug(name), categoryId: categoryRows[categoryName].id, brand: details.brand, description: details.description, status: ProductStatus.ACTIVE } });
    for (const [sortOrder, url] of galleryUrls(details.imageUrl).entries()) {
      const storageKey = `unsplash/${product.slug}/${sortOrder}`;
      if (sortOrder === 0) {
        await prisma.productMedia.upsert({ where: { id: product.id }, update: { storageKey, url, altText: `${name} product photograph`, sortOrder }, create: { id: product.id, productId: product.id, storageKey, url, altText: `${name} product photograph`, sortOrder } });
      } else {
        const media = await prisma.productMedia.findFirst({ where: { productId: product.id, storageKey } });
        if (media) await prisma.productMedia.update({ where: { id: media.id }, data: { url, altText: `${name} product photograph ${sortOrder + 1}`, sortOrder } });
        else await prisma.productMedia.create({ data: { productId: product.id, storageKey, url, altText: `${name} product photograph ${sortOrder + 1}`, sortOrder } });
      }
    }
    const variantRows = [] as Array<{ id: string; name: string }>;
    for (const variant of variants) variantRows.push(await prisma.productVariant.upsert({ where: { sku: `QA-${product.slug}-${slug(variant)}` }, update: { name: variant, status: "ACTIVE" }, create: { productId: product.id, name: variant, sku: `QA-${product.slug}-${slug(variant)}`, attributes: { option: variant }, status: "ACTIVE" } }));
    const offers = [supplierA, ...(productOrdinal < 5 ? [supplierB] : [])];
    for (const [offerIndex, supplier] of offers.entries()) {
      const variant = variantRows.length ? variantRows[offerIndex % variantRows.length] : null;
      const key = `QA-${supplier.slug}-${product.slug}-${variant?.id ?? "base"}`;
      const existingListing = await prisma.supplierListing.findFirst({ where: { supplierSku: key } });
      const listing = existingListing
        ? await prisma.supplierListing.update({ where: { id: existingListing.id }, data: { price: (1000 + listingOrdinal * 137).toFixed(2), status: listingOrdinal >= 23 ? SupplierListingStatus.INACTIVE : SupplierListingStatus.ACTIVE } })
        : await prisma.supplierListing.create({ data: { supplierId: supplier.id, productId: product.id, productVariantId: variant?.id, supplierSku: key, price: (1000 + listingOrdinal * 137).toFixed(2), currencyCode: name === "A5 Hardcover Notebook Set" ? "USD" : "KES", status: listingOrdinal >= 23 ? SupplierListingStatus.INACTIVE : SupplierListingStatus.ACTIVE, warrantyDays: 30 } });
      const location = supplier.id === supplierA.id ? locations[listingOrdinal % 2] : locations[2]; const onHand = listingOrdinal === 22 ? 0 : 8 + (listingOrdinal % 12);
      const item = await prisma.inventoryItem.upsert({ where: { supplierListingId_inventoryLocationId: { supplierListingId: listing.id, inventoryLocationId: location.id } }, update: { onHand, reserved: 0 }, create: { supplierListingId: listing.id, inventoryLocationId: location.id, onHand, reserved: 0 } });
      if (onHand > 0) await prisma.inventoryMovement.upsert({ where: { id: item.id }, update: {}, create: { id: item.id, inventoryItemId: item.id, type: "STOCK_IN", quantity: onHand, previousOnHand: 0, newOnHand: onHand, referenceType: "QA_SEED", referenceId: listing.id, actorUserId: qaUsers["supplier@gmail.com"].id } });
      listingOrdinal += 1;
    }
  }
  for (const [email, firstName] of [["customer@gmail.com", "QA Customer"], ["customer2@gmail.com", "QA Customer Two"]] as const) {
    const profile = await prisma.customerProfile.upsert({ where: { userId: qaUsers[email].id }, update: { firstName }, create: { userId: qaUsers[email].id, firstName, lastName: "Demo", phone: "+254700000099" } });
    await prisma.customerAddress.upsert({ where: { id: profile.id }, update: {}, create: { id: profile.id, customerProfileId: profile.id, label: "QA Nairobi", recipientName: firstName, phone: "+254700000099", countryCode: "KE", region: "Nairobi", city: "Nairobi", street: "QA Demonstration Street", isDefault: true } });
  }
  for (const [code, name, city] of [["QA-NRB-CBD", "Nairobi CBD Pickup", "Nairobi"], ["QA-WESTLANDS", "Westlands Pickup", "Nairobi"], ["QA-KILIMANI", "Kilimani Pickup", "Nairobi"]] as const) await prisma.pickupPoint.upsert({ where: { code }, update: { status: "ACTIVE" }, create: { code, name, slug: slug(name), countryCode: "KE", region: "Nairobi", city, address: "QA demonstration collection location", pickupFee: "150.00", status: "ACTIVE" } });
  const zone = await prisma.deliveryZone.upsert({ where: { id: "00000000-0000-4000-8000-000000000001" }, update: {}, create: { id: "00000000-0000-4000-8000-000000000001", name: "QA Nairobi", countryCode: "KE", region: "Nairobi", city: "Nairobi", status: "ACTIVE" } });
  await prisma.deliveryRate.upsert({ where: { id: "00000000-0000-4000-8000-000000000002" }, update: {}, create: { id: "00000000-0000-4000-8000-000000000002", deliveryZoneId: zone.id, name: "QA Nairobi standard", amount: "250.00", currencyCode: "KES", status: "ACTIVE" } });
  console.log(JSON.stringify({ users: await prisma.user.count({ where: { displayName: { startsWith: "QA " } } }), categories: await prisma.category.count({ where: { slug: { startsWith: "qa-" } } }), products: await prisma.product.count({ where: { slug: { startsWith: "qa-" } } }), listings: await prisma.supplierListing.count({ where: { supplierSku: { startsWith: "QA-" } } }) }));
}
main().finally(() => prisma.$disconnect());

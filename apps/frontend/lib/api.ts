export type OrganizationContext = { id: string; name: string; slug: string; permissions: string[] };
export type Session = { id: string; email: string; displayName: string | null; organizations: OrganizationContext[]; platformPermissions: string[] };
export type CatalogueCategory = { id: string; name: string; slug: string; description: string | null; parentId: string | null };
export type CatalogueItem = {
  id: string; title: string; description: string | null; brand: string | null; price: string; currencyCode: string; availableQuantity: number;
  product: { id: string; slug: string; name: string; category: { id: string; name: string; slug: string } };
  variant: { id: string; name: string; attributes: Record<string, unknown> } | null;
  image: { url: string; altText: string } | null;
};
export type CataloguePage = { data: CatalogueItem[]; page: number; limit: number; total: number };
export type CatalogueMedia = { id: string; url: string; altText: string };
export type CatalogueVariant = { id: string; name: string; attributes: Record<string, unknown> };
export type CatalogueOffer = { id: string; price: string; currencyCode: string; variantId: string | null; variant: CatalogueVariant | null; availability: "IN_STOCK"; supplier: { slug: string; name: string } };
export type CatalogueProduct = {
  id: string; name: string; slug: string; brand: string | null;
  category: { id: string; name: string; slug: string }; image: CatalogueMedia | null;
  offerCount: number; offers: CatalogueOffer[];
};
export type CatalogueProductDetail = CatalogueProduct & { description: string | null; media: CatalogueMedia[]; variants: CatalogueVariant[] };
export type CatalogueProductPage = { data: CatalogueProduct[]; page: number; limit: number; total: number; filters: { suppliers: Array<{ slug: string; name: string }>; currencies: string[] } };
export type CartResponse = { id: string; status: "ACTIVE"; currencyCode: string | null; subtotal: string; items: Array<{ id: string; supplierListingId: string; quantity: number; unitPriceSnapshot: string; currencyCode: string; currentPrice: string | null; currentAvailability: number; eligible: boolean; productName: string | null; productSlug: string | null; variantName: string | null; supplierDisplayName: string | null; primaryImage: { url: string; altText: string } | null }> };
export type CustomerAddress = { id: string; label: string | null; recipientName: string; phone: string; alternativePhone: string | null; countryCode: string; region: string; city: string; estate: string | null; street: string | null; building: string | null; houseNumber: string | null; landmark: string | null; deliveryNotes: string | null; isDefault: boolean };
export type AddressInput = Pick<CustomerAddress, "recipientName" | "phone" | "countryCode" | "region" | "city"> & Partial<Omit<CustomerAddress, "id" | "recipientName" | "phone" | "countryCode" | "region" | "city">>;
export type AddressUpdate = Partial<AddressInput>;
export type PickupPoint = { id: string; name: string; code: string; slug: string; countryCode: string; region: string; city: string; address: string; landmark: string | null; phone: string | null; pickupFee: string; storageLimitDays: number | null };
export const checkoutFulfillmentMethod = { DELIVERY: "DELIVERY", PICKUP: "PICKUP" } as const;
export type CheckoutFulfillmentMethod = typeof checkoutFulfillmentMethod[keyof typeof checkoutFulfillmentMethod];
export type CheckoutSummary = { orderId: string; orderNumber: string; status: "PENDING_PAYMENT" | "AWAITING_DELIVERY_QUOTE"; paymentStatus: "UNPAID"; fulfillmentMethod: "DELIVERY" | "PICKUP"; currencyCode: string; subtotal: string; deliveryFee: string; pickupFee: string; total: string; deliveryQuoteRequired: boolean; collectionCode?: string; supplierOrderCount: number; createdAt: string };
export type CheckoutPreview = { currencyCode: string; subtotal: string; deliveryFee: string; pickupFee: string; total: string; deliveryQuoteRequired: boolean; availablePaymentMethods: Array<"CARD" | "MPESA"> };
export type OrderStatus = "PENDING_PAYMENT" | "AWAITING_DELIVERY_QUOTE" | "PAYMENT_CONFIRMED" | "PROCESSING" | "READY_FOR_PICKUP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "PAYMENT_REVIEW" | "CANCELLED" | "EXPIRED";
export type OrderPaymentStatus = "UNPAID" | "PAID" | "PAID_REVIEW";
export type PaymentStatus = "INITIALIZATION_PENDING" | "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "UNKNOWN";
export type CustomerOrderItem = { id: string; productNameSnapshot: string; variantNameSnapshot: string | null; supplierNameSnapshot: string; supplierSkuSnapshot: string | null; quantity: number; unitPrice: string; lineTotal: string; currencyCode: string };
export type CustomerOrder = { id: string; orderNumber: string; status: OrderStatus; paymentStatus: OrderPaymentStatus; currencyCode: string; subtotal: string; deliveryFee: string; pickupFee: string; total: string; fulfillmentMethod: "DELIVERY" | "PICKUP"; createdAt: string; items: CustomerOrderItem[]; statusHistory: Array<{ id: string; newStatus: OrderStatus; publicMessage: string | null; createdAt: string }> };
export type CustomerOrderListItem = Omit<CustomerOrder, "items" | "statusHistory"> & { items: Array<Pick<CustomerOrderItem, "productNameSnapshot" | "variantNameSnapshot" | "quantity" | "unitPrice" | "lineTotal">> };
export type CustomerTracking = { orderNumber: string; paymentStatus: OrderPaymentStatus; fulfillmentMethod: "DELIVERY" | "PICKUP"; currentStatus: OrderStatus; quote: { status: string; amount: string | null; currencyCode: string; expiresAt: string | null } | null; pickup: { name: string; address: string; city: string; region: string; phone: string | null; pickupFee: string } | null; delivery: { recipientName: string; countryCode: string; region: string; city: string; estate: string | null; street: string | null; building: string | null; houseNumber: string | null; landmark: string | null } | null; supplierProgress: Array<{ supplierDisplayName: string; status: string }>; timeline: Array<{ timestamp: string; status: string; message: string | null; supplierDisplayName: string | null }> };
export type SupportCategory = "ORDER" | "PAYMENT" | "DELIVERY" | "REFUND" | "RETURN" | "WARRANTY" | "PRODUCT" | "ACCOUNT" | "SUPPLIER" | "OTHER";
export type CustomerSupportTicket = { id: string; ticketNumber: string; category: SupportCategory; priority: string; status: string; subject: string; relatedEntityType: string | null; relatedEntityId: string | null; requesterUserId: string; createdAt: string; updatedAt: string; messages?: Array<{ id: string; authorUserId: string; body: string; createdAt: string }> };
export type PaymentFailureKind = "CONFIGURATION_REJECTED" | "PROVIDER_REJECTED" | "INITIALIZATION_FAILED" | "PROVIDER_FAILED" | "NETWORK_UNCERTAIN" | "PROVIDER_RESPONSE_UNCERTAIN";
export type PaymentAttempt = { id: string; orderId: string; provider: "PAYSTACK"; reference: string; status: PaymentStatus; initializedAt: string | null; succeededAt: string | null; lastVerifiedAt: string | null; createdAt: string; canResume?: boolean; canRetry?: boolean; failureKind?: PaymentFailureKind | null };
export type PaymentStatusResponse = { payment: PaymentAttempt | null; order: Pick<CustomerOrder, "id" | "orderNumber" | "status" | "paymentStatus"> };
export type PaymentInitialization = { paymentId: string; provider: "PAYSTACK"; reference: string; authorizationUrl: string | null; accessCode: string | null; status: PaymentStatus; requestedChannel: "card" | "mobile_money" | null; failureKind?: PaymentFailureKind | null };

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: "include", ...init, headers: { "content-type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message : Array.isArray(body.message) && body.message.every((item: unknown): item is string => typeof item === "string") ? body.message.join(" ") : "Something went wrong. Please try again.";
    throw new ApiError(response.status, message);
  }
  return response.json() as Promise<T>;
}

function catalogueQuery(query: { categoryId?: string; search?: string; page?: number; limit?: number }): string {
  const params = new URLSearchParams();
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.search) params.set("search", query.search);
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  const value = params.toString();
  return value ? `?${value}` : "";
}

function publicProductQuery(query: { category?: string; search?: string; supplier?: string; currency?: string; minPrice?: string; maxPrice?: string; sort?: string; page?: number; limit?: number }): string {
  const params = new URLSearchParams();
  if (query.category) params.set("category", query.category);
  if (query.search) params.set("search", query.search);
  if (query.supplier) params.set("supplier", query.supplier);
  if (query.currency) params.set("currency", query.currency);
  if (query.minPrice) params.set("minPrice", query.minPrice);
  if (query.maxPrice) params.set("maxPrice", query.maxPrice);
  if (query.sort) params.set("sort", query.sort);
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  const value = params.toString();
  return value ? `?${value}` : "";
}

export const api = {
  me: () => request<Session>("/auth/me"),
  login: (email: string, password: string) => request<unknown>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string, displayName: string) => request<unknown>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, displayName: displayName || undefined }) }),
  logout: () => request<unknown>("/auth/logout", { method: "POST" }),
  supplier: (organizationId: string) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/supplier`),
  supplierOverview: (organizationId: string) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/supplier/overview`),
  updateSupplier: (organizationId: string, input: Record<string, unknown>) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/supplier`, { method: "PATCH", body: JSON.stringify(input) }),
  submitSupplier: (organizationId: string) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/supplier/submit`, { method: "POST" }),
  supplierListings: (organizationId: string) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/listings?limit=100`),
  supplierProductSelection: (organizationId: string, query: { search?: string; page?: number } = {}) => { const params = new URLSearchParams({ limit: "20", ...(query.search ? { search: query.search } : {}), ...(query.page ? { page: String(query.page) } : {}) }); return request<any>(`/organizations/${encodeURIComponent(organizationId)}/listings/products/selection?${params}`); },
  createSupplierListing: (organizationId: string, input: Record<string, unknown>) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/listings`, { method: "POST", body: JSON.stringify(input) }),
  updateSupplierListing: (organizationId: string, listingId: string, input: Record<string, unknown>) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/listings/${encodeURIComponent(listingId)}`, { method: "PATCH", body: JSON.stringify(input) }),
  listingLifecycle: (organizationId: string, listingId: string, action: "activate" | "deactivate") => request<any>(`/organizations/${encodeURIComponent(organizationId)}/listings/${encodeURIComponent(listingId)}/${action}`, { method: "POST" }),
  inventory: (organizationId: string) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/inventory?limit=100`),
  inventoryLocations: (organizationId: string) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/inventory/locations`),
  createInventoryLocation: (organizationId: string, input: Record<string, unknown>) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/inventory/locations`, { method: "POST", body: JSON.stringify(input) }),
  stock: (organizationId: string, action: "receive" | "adjust", input: Record<string, unknown>) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/inventory/${action}`, { method: "POST", body: JSON.stringify(input) }),
  removeStock: (organizationId: string, itemId: string, input: Record<string, unknown>) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/inventory/${encodeURIComponent(itemId)}/remove`, { method: "POST", body: JSON.stringify(input) }),
  inventoryMovements: (organizationId: string, itemId: string) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/inventory/${encodeURIComponent(itemId)}/movements?limit=100`),
  supplierOrders: (organizationId: string) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/supplier-orders`),
  supplierOrder: (organizationId: string, orderId: string) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/supplier-orders/${encodeURIComponent(orderId)}`),
  fulfil: (organizationId: string, orderId: string, action: string, input: Record<string, unknown>) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/supplier-orders/${encodeURIComponent(orderId)}/${action}`, { method: "POST", body: JSON.stringify(input) }),
  supplierFinanceBalance: (organizationId: string) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/finance/balance`),
  supplierLedger: (organizationId: string, query: { page?: number; limit?: number } = {}) => {
    const params = new URLSearchParams({ page: String(query.page ?? 1), limit: String(query.limit ?? 25) });
    return request<{ data: any[]; page: number; limit: number; total: number }>(`/organizations/${encodeURIComponent(organizationId)}/finance/ledger?${params}`);
  },
  supplierCommissions: (organizationId: string) => request<any[]>(`/organizations/${encodeURIComponent(organizationId)}/finance/commissions`),
  supplierSettlements: (organizationId: string) => request<any[]>(`/organizations/${encodeURIComponent(organizationId)}/finance/settlements`),
  supplierSettlement: (organizationId: string, settlementId: string) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/finance/settlements/${encodeURIComponent(settlementId)}`),
  supplierReturns: (organizationId: string) => request<any[]>(`/organizations/${encodeURIComponent(organizationId)}/returns`),
  supplierReturn: (organizationId: string, returnId: string) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/returns/${encodeURIComponent(returnId)}`),
  supplierWarranties: (organizationId: string) => request<any[]>(`/organizations/${encodeURIComponent(organizationId)}/warranties`),
  supplierSupportTickets: (organizationId: string) => request<any[]>(`/organizations/${encodeURIComponent(organizationId)}/support/tickets`),
  supplierSupportTicket: (organizationId: string, ticketId: string) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/support/tickets/${encodeURIComponent(ticketId)}`),
  createSupplierSupportTicket: (organizationId: string, input: { category: SupportCategory; subject: string; message: string; relatedEntityType?: string; relatedEntityId?: string }) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/support/tickets`, { method: "POST", body: JSON.stringify(input) }),
  replySupplierSupportTicket: (organizationId: string, ticketId: string, body: string) => request<any>(`/organizations/${encodeURIComponent(organizationId)}/support/tickets/${encodeURIComponent(ticketId)}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
  catalogueCategories: () => request<CatalogueCategory[]>("/catalogue/categories"),
  catalogue: (query: { categoryId?: string; search?: string; page?: number; limit?: number } = {}) => request<CataloguePage>(`/catalogue/listings${catalogueQuery(query)}`),
  catalogueItem: (listingId: string) => request<CatalogueItem>(`/catalogue/listings/${listingId}`),
  catalogueCategory: (slug: string) => request<CatalogueCategory>(`/catalogue/categories/${encodeURIComponent(slug)}`),
  catalogueProducts: (query: { category?: string; search?: string; supplier?: string; currency?: string; minPrice?: string; maxPrice?: string; sort?: string; page?: number; limit?: number } = {}, init?: RequestInit) => request<CatalogueProductPage>(`/catalogue/products${publicProductQuery(query)}`, init),
  catalogueProduct: (slug: string) => request<CatalogueProductDetail>(`/catalogue/products/${encodeURIComponent(slug)}`),
  cart: () => request<CartResponse>("/customer/cart"),
  addCartItem: (supplierListingId: string, quantity: number) => request<CartResponse>("/customer/cart/items", { method: "POST", body: JSON.stringify({ supplierListingId, quantity }) }),
  updateCartItem: (cartItemId: string, quantity: number) => request<CartResponse>(`/customer/cart/items/${encodeURIComponent(cartItemId)}`, { method: "PATCH", body: JSON.stringify({ quantity }) }),
  removeCartItem: (cartItemId: string) => request<CartResponse>(`/customer/cart/items/${encodeURIComponent(cartItemId)}`, { method: "DELETE" }),
  clearCart: () => request<CartResponse>("/customer/cart/clear", { method: "POST" }),
  customerAddresses: () => request<CustomerAddress[]>("/customer/addresses"),
  customerAddress: (addressId: string) => request<CustomerAddress>(`/customer/addresses/${encodeURIComponent(addressId)}`),
  createCustomerAddress: (input: AddressInput) => request<CustomerAddress>("/customer/addresses", { method: "POST", body: JSON.stringify(input) }),
  updateCustomerAddress: (addressId: string, input: AddressUpdate) => request<CustomerAddress>(`/customer/addresses/${encodeURIComponent(addressId)}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteCustomerAddress: (addressId: string) => request<{ deleted: true; defaultAddressId: string | null }>(`/customer/addresses/${encodeURIComponent(addressId)}`, { method: "DELETE" }),
  setDefaultCustomerAddress: (addressId: string) => request<CustomerAddress>(`/customer/addresses/${encodeURIComponent(addressId)}/default`, { method: "POST" }),
  pickupPoints: (query: { countryCode?: string; region?: string; city?: string } = {}) => {
    const params = new URLSearchParams();
    if (query.countryCode) params.set("countryCode", query.countryCode);
    if (query.region) params.set("region", query.region);
    if (query.city) params.set("city", query.city);
    return request<PickupPoint[]>(`/pickup-points${params.size ? `?${params}` : ""}`);
  },
  previewCheckout: (input: { fulfillmentMethod: typeof checkoutFulfillmentMethod.DELIVERY; addressId: string } | { fulfillmentMethod: typeof checkoutFulfillmentMethod.PICKUP; pickupPointId: string }) => request<CheckoutPreview>("/customer/checkout/preview", { method: "POST", body: JSON.stringify(input) }),
  prepareCheckout: (input: { fulfillmentMethod: typeof checkoutFulfillmentMethod.DELIVERY; addressId: string } | { fulfillmentMethod: typeof checkoutFulfillmentMethod.PICKUP; pickupPointId: string }, idempotencyKey: string) => request<CheckoutSummary>("/customer/checkout/prepare", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(input) }),
  customerOrders: () => request<CustomerOrderListItem[]>("/customer/orders"),
  customerOrder: (orderId: string) => request<CustomerOrder>(`/customer/orders/${encodeURIComponent(orderId)}`),
  customerTracking: (orderId: string) => request<CustomerTracking>(`/customer/orders/${encodeURIComponent(orderId)}/tracking`),
  initializePayment: (orderId: string, idempotencyKey: string, method: "CARD" | "MPESA") => request<PaymentInitialization>(`/customer/orders/${encodeURIComponent(orderId)}/payments/initialize`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ method }) }),
  paymentStatus: (orderId: string) => request<PaymentStatusResponse>(`/customer/orders/${encodeURIComponent(orderId)}/payment-status`),
  verifyPayment: (orderId: string, paymentId: string) => request<PaymentAttempt>(`/customer/orders/${encodeURIComponent(orderId)}/payments/${encodeURIComponent(paymentId)}/verify`, { method: "POST" }),
  supportTickets: () => request<CustomerSupportTicket[]>("/customer/support/tickets"),
  supportTicket: (ticketId: string) => request<CustomerSupportTicket>(`/customer/support/tickets/${encodeURIComponent(ticketId)}`),
  createSupportTicket: (input: { category: SupportCategory; subject: string; message: string; relatedEntityType?: string; relatedEntityId?: string }) => request<CustomerSupportTicket>("/customer/support/tickets", { method: "POST", body: JSON.stringify(input) }),
  replySupportTicket: (ticketId: string, body: string) => request<unknown>(`/customer/support/tickets/${encodeURIComponent(ticketId)}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
  platformSummary: () => request<any>("/platform/operations/summary"),
  platformQueue: (queue: string) => request<any>(`/platform/operations/${encodeURIComponent(queue)}?limit=100`),
  platformSuppliers: (query: { status?: string; search?: string } = {}) => request<any>(`/platform/suppliers?${new URLSearchParams({ limit: "100", ...(query.status ? { status: query.status } : {}), ...(query.search ? { search: query.search } : {}) })}`),
  platformSupplierAction: (id: string, action: "approve" | "reject" | "suspend" | "reactivate", reason?: string) => request<any>(`/platform/suppliers/${encodeURIComponent(id)}/${action}`, { method: "POST", body: JSON.stringify(reason ? { reason } : {}) }),
  platformCategories: () => request<any[]>("/platform/categories"),
  createPlatformCategory: (input: Record<string, unknown>) => request<any>("/platform/categories", { method: "POST", body: JSON.stringify(input) }),
  updatePlatformCategory: (id: string, input: Record<string, unknown>) => request<any>(`/platform/categories/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }),
  platformListings: (query: { search?: string; status?: string; supplierId?: string; productId?: string; page?: number; limit?: number } = {}) => request<any>(`/platform/listings?${new URLSearchParams({ page: String(query.page ?? 1), limit: String(query.limit ?? 25), ...(query.search ? { search: query.search } : {}), ...(query.status ? { status: query.status } : {}), ...(query.supplierId ? { supplierId: query.supplierId } : {}), ...(query.productId ? { productId: query.productId } : {}) })}`),
  platformProducts: (query: { search?: string; status?: string } = {}) => request<any>(`/platform/products?${new URLSearchParams({ limit: "100", ...(query.search ? { search: query.search } : {}), ...(query.status ? { status: query.status } : {}) })}`),
  createPlatformProduct: (input: Record<string, unknown>) => request<any>("/platform/products", { method: "POST", body: JSON.stringify(input) }),
  updatePlatformProduct: (id: string, input: Record<string, unknown>) => request<any>(`/platform/products/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }),
  platformVariants: (id: string) => request<any[]>(`/platform/products/${encodeURIComponent(id)}/variants`),
  createPlatformVariant: (id: string, input: Record<string, unknown>) => request<any>(`/platform/products/${encodeURIComponent(id)}/variants`, { method: "POST", body: JSON.stringify(input) }),
  platformMedia: (id: string) => request<any[]>(`/platform/products/${encodeURIComponent(id)}/media`),
  createPlatformMedia: (id: string, input: Record<string, unknown>) => request<any>(`/platform/products/${encodeURIComponent(id)}/media`, { method: "POST", body: JSON.stringify(input) }),
  platformOrders: () => request<any[]>("/platform/orders"),
  platformOrder: (id: string) => request<any>(`/platform/orders/${encodeURIComponent(id)}`),
  platformPayments: (status?: string) => request<any>(`/platform/payments?${new URLSearchParams({ limit: "100", ...(status ? { status } : {}) })}`),
  reconcilePayment: (id: string) => request<any>(`/platform/payments/${encodeURIComponent(id)}/reconcile`, { method: "POST" }),
  platformPickupPoints: () => request<any[]>("/platform/pickup-points"),
  createPickupPoint: (input: Record<string, unknown>) => request<any>("/platform/pickup-points", { method: "POST", body: JSON.stringify(input) }),
  platformDeliveryZones: () => request<any[]>("/platform/delivery/zones"),
  platformDeliveryRates: () => request<any[]>("/platform/delivery/rates"),
  platformDeliveryQuotes: () => request<any[]>("/platform/delivery/quotes"),
  setDeliveryQuote: (id: string, input: Record<string, unknown>) => request<any>(`/platform/delivery/quotes/${encodeURIComponent(id)}/quote`, { method: "POST", body: JSON.stringify(input) }),
  platformRefundRequests: () => request<any[]>("/platform/refund-requests"),
  refundAction: (id: string, action: "approve" | "reject", reason?: string) => request<any>(`/platform/refund-requests/${encodeURIComponent(id)}/${action}`, { method: "POST", body: JSON.stringify(reason ? { reason } : {}) }),
  platformReturns: () => request<any[]>("/platform/returns"),
  returnAction: (id: string, action: string, input: Record<string, unknown> = {}) => request<any>(`/platform/returns/${encodeURIComponent(id)}/${action}`, { method: "POST", body: JSON.stringify(input) }),
  platformWarranties: () => request<any[]>("/platform/warranties"),
  warrantyAction: (id: string, action: string, input: Record<string, unknown> = {}) => request<any>(`/platform/warranties/${encodeURIComponent(id)}/${action}`, { method: "POST", body: JSON.stringify(input) }),
  platformSupportTickets: () => request<any[]>("/platform/support/tickets"),
  platformSupportTicket: (id: string) => request<any>(`/platform/support/tickets/${encodeURIComponent(id)}`),
  platformSupportAction: (id: string, action: string, input: Record<string, unknown> = {}) => request<any>(`/platform/support/tickets/${encodeURIComponent(id)}/${action}`, { method: "POST", body: JSON.stringify(input) }),
};

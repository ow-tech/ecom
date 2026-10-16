import { api, type CartResponse } from "./api";

export type CartItem = {
  id: string; supplierListingId: string; quantity: number; unitPrice: string; currency: string;
  currentPrice: string | null; availability: number; eligible: boolean; productName: string;
  productSlug: string | null; variantName: string | null; supplierName: string | null;
  image: { url: string; altText: string } | null;
};
export type Cart = { id: string; currency: string | null; subtotal: string; items: CartItem[] };

function normalize(cart: CartResponse): Cart {
  return { id: cart.id, currency: cart.currencyCode, subtotal: cart.subtotal, items: cart.items.map((item) => ({
    id: item.id, supplierListingId: item.supplierListingId, quantity: item.quantity, unitPrice: item.unitPriceSnapshot,
    currency: item.currencyCode, currentPrice: item.currentPrice, availability: item.currentAvailability,
    eligible: item.eligible, productName: item.productName ?? "Unavailable product", productSlug: item.productSlug,
    variantName: item.variantName, supplierName: item.supplierDisplayName, image: item.primaryImage,
  })) };
}

export const cartClient = {
  getCart: async () => normalize(await api.cart()),
  addItem: async (supplierListingId: string, quantity = 1) => normalize(await api.addCartItem(supplierListingId, quantity)),
  updateItem: async (cartItemId: string, quantity: number) => normalize(await api.updateCartItem(cartItemId, quantity)),
  removeItem: async (cartItemId: string) => normalize(await api.removeCartItem(cartItemId)),
  clear: async () => normalize(await api.clearCart()),
};

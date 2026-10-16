"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError } from "../lib/api";
import { cartClient, type Cart } from "../lib/cart";
import { useSession } from "./session-provider";

type CartState = { cart: Cart | null; count: number; loading: boolean; refresh: () => Promise<void>; addItem: (listingId: string, quantity?: number) => Promise<void>; updateItem: (itemId: string, quantity: number) => Promise<void>; removeItem: (itemId: string) => Promise<void>; clear: () => Promise<void> };
const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { session, loading: sessionLoading } = useSession();
  const [cart, setCart] = useState<Cart | null>(null); const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    if (!session) { setCart(null); return; }
    setLoading(true);
    try { setCart(await cartClient.getCart()); }
    catch (error) { if (error instanceof ApiError && error.status === 401) setCart(null); else throw error; }
    finally { setLoading(false); }
  }, [session]);
  useEffect(() => { if (!sessionLoading) void refresh(); }, [sessionLoading, refresh]);
  const mutate = useCallback(async (operation: () => Promise<Cart>) => { const next = await operation(); setCart(next); }, []);
  const value = useMemo(() => ({ cart, count: cart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0, loading, refresh, addItem: (id: string, quantity = 1) => mutate(() => cartClient.addItem(id, quantity)), updateItem: (id: string, quantity: number) => mutate(() => cartClient.updateItem(id, quantity)), removeItem: (id: string) => mutate(() => cartClient.removeItem(id)), clear: () => mutate(() => cartClient.clear()) }), [cart, loading, mutate, refresh]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart() { const state = useContext(CartContext); if (!state) throw new Error("useCart must be inside CartProvider"); return state; }

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Simple store cart persisted to localStorage. Items: { variantId, title,
// unitPriceCents, quantity, image }. Prices are revalidated server-side at
// checkout — the cart is only a convenience.
const CartCtx = createContext(null);
export const useCart = () => useContext(CartCtx);

const KEY = 'store-cart';

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  });

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)); }, [items]);

  const value = useMemo(() => ({
    items,
    count: items.reduce((n, i) => n + i.quantity, 0),
    totalCents: items.reduce((n, i) => n + i.quantity * i.unitPriceCents, 0),
    add(item, qty = 1) {
      setItems((prev) => {
        const i = prev.findIndex((x) => x.variantId === item.variantId);
        if (i >= 0) {
          const next = [...prev];
          next[i] = { ...next[i], quantity: next[i].quantity + qty };
          return next;
        }
        return [...prev, { ...item, quantity: qty }];
      });
    },
    setQty(variantId, quantity) {
      setItems((prev) =>
        quantity <= 0
          ? prev.filter((x) => x.variantId !== variantId)
          : prev.map((x) => (x.variantId === variantId ? { ...x, quantity } : x)));
    },
    remove(variantId) { setItems((prev) => prev.filter((x) => x.variantId !== variantId)); },
    clear() { setItems([]); },
  }), [items]);

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

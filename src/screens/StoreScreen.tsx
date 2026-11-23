import React, { useState } from 'react';
import {
  Check,
  CreditCard,
  DollarSign,
  Plus,
  Receipt,
  ShoppingBag,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { MENU_ITEMS } from '../data/menu';
import { showToast } from '../services/toastNotice';
import type {
  FlavorOption,
  LoungeSettings,
  LoungeTable,
  MenuItem,
  OrderItem,
  PaymentMethod,
} from '../types';

interface StoreScreenProps {
  tables: LoungeTable[];
  flavors: FlavorOption[];
  settings: LoungeSettings;
  staffName: string;
  onAddOrderToTable: (tableId: string, order: OrderItem) => void;
  onSeatTableWithOrders?: (tableId: string, orders: OrderItem[]) => void;
  onCheckoutCounterSale: (
    session: {
      tableName: string;
      orders: OrderItem[];
      subtotal: number;
      tax: number;
      total: number;
      paymentMethod: PaymentMethod;
      cashPaid: number;
      cardPaid: number;
    }
  ) => void;
}

export const StoreScreen: React.FC<StoreScreenProps> = ({
  tables,
  flavors,
  settings,
  staffName,
  onAddOrderToTable,
  onCheckoutCounterSale,
}) => {
  const [storeItems, setStoreItems] = useState<MenuItem[]>(() =>
    MENU_ITEMS.filter((m) => m.category === 'store')
  );

  // Cart State
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [hookahPriceInput, setHookahPriceInput] = useState<string>('69');
  const [selectedShishaFlavor, setSelectedShishaFlavor] = useState<string>('');
  const [selectedTargetTableId, setSelectedTargetTableId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [confirmCheckout, setConfirmCheckout] = useState(false);

  // Custom Item Modal State
  const [isAddCustomOpen, setIsAddCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customTaxable, setCustomTaxable] = useState(true);

  const availableFlavors = flavors.filter((f) => f.available);
  const activeTables = tables.filter((t) => t.status === 'occupied');

  const taxRate = settings.salesTaxRate !== undefined ? settings.salesTaxRate : 0.0775;

  // Cart Totals
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const salesTax = cart
    .filter((item) => item.taxable)
    .reduce((sum, item) => sum + item.unitPrice * item.quantity * taxRate, 0);
  const total = subtotal + salesTax;

  const handleAddToCart = (item: MenuItem) => {
    let effectivePrice = item.price;
    let selectedFlv: string[] | undefined = undefined;

    if (item.id === 'st-hookah') {
      effectivePrice = Math.max(1, Number(hookahPriceInput) || 69);
    }

    if (item.requiresFlavorSelection) {
      const flvName = selectedShishaFlavor || availableFlavors[0]?.name || 'House Mix';
      selectedFlv = [flvName];
    }

    const newOrderItem: OrderItem = {
      id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      menuItemId: item.id,
      name: item.name,
      category: 'store',
      unitPrice: effectivePrice,
      quantity: 1,
      taxable: item.taxable !== false,
      flavors: selectedFlv,
      addedBy: staffName,
      prepStatus: 'served',
      orderedAt: Date.now(),
    };

    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (i) =>
          i.menuItemId === newOrderItem.menuItemId &&
          i.unitPrice === newOrderItem.unitPrice &&
          JSON.stringify(i.flavors) === JSON.stringify(newOrderItem.flavors)
      );
      if (existingIdx !== -1) {
        const next = [...prev];
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: next[existingIdx].quantity + 1,
        };
        return next;
      }
      return [...prev, newOrderItem];
    });
  };

  const handleUpdateCartQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.id === id) {
            const nextQty = i.quantity + delta;
            return nextQty > 0 ? { ...i, quantity: nextQty } : null;
          }
          return i;
        })
        .filter((i): i is OrderItem => i !== null)
    );
  };

  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    const name = customName.trim();
    const price = Math.max(0, Number(customPrice) || 0);
    if (!name) return;

    const newItem: MenuItem = {
      id: `custom-st-${Date.now()}`,
      name,
      category: 'store',
      price,
      taxable: customTaxable,
      description: `Custom retail item (+ tax)`,
    };

    setStoreItems((prev) => [...prev, newItem]);
    handleAddToCart(newItem);

    setCustomName('');
    setCustomPrice('');
    setCustomTaxable(true);
    setIsAddCustomOpen(false);
  };

  const handleAssignCartToTable = () => {
    if (!selectedTargetTableId || cart.length === 0) return;
    const targetTable = tables.find((t) => t.id === selectedTargetTableId);
    if (!targetTable) return;

    if (targetTable.status === 'available' && onSeatTableWithOrders) {
      onSeatTableWithOrders(selectedTargetTableId, cart);
    } else {
      for (const item of cart) {
        onAddOrderToTable(selectedTargetTableId, item);
      }
    }
    const tableName = targetTable.tableNumber ? `#${targetTable.tableNumber} ${targetTable.name}` : targetTable.name;
    setCart([]);
    setSelectedTargetTableId('');
    showToast(`Store tab attached to ${tableName} successfully!`, 'As You Wish ✨');
  };

  const handleCounterCheckout = () => {
    if (!confirmCheckout) {
      setConfirmCheckout(true);
      return;
    }

    onCheckoutCounterSale({
      tableName: 'Retail Store Counter Sale',
      orders: cart,
      subtotal,
      tax: salesTax,
      total,
      paymentMethod,
      cashPaid: paymentMethod === 'cash' ? total : 0,
      cardPaid: paymentMethod === 'card' ? total : 0,
    });

    setCart([]);
    setConfirmCheckout(false);
    showToast('Counter Sale completed!', 'As You Wish ✨');
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/25 bg-[#0B101D] p-4 shadow-[0_0_30px_rgba(6,182,212,0.12)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 text-slate-950 font-bold">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 font-display tracking-wide">
              Retail Store POS Menu
            </h1>
            <p className="text-xs text-slate-400">
              Retail Shisha, Hookahs, Vapes &amp; Accessories (+ {(taxRate * 100).toFixed(1)}% Sales Tax)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsAddCustomOpen(true)}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-cyan-400 px-4 text-xs font-bold text-slate-950 hover:bg-cyan-300 cyber-glow-cyan"
        >
          <Plus className="h-4 w-4" />
          Add Custom Item
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: Store Items Catalog */}
        <div className="lg:col-span-2 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {storeItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col justify-between rounded-2xl border border-cyan-500/20 bg-[#0B101D] p-4 hover:border-cyan-400/50 transition-colors shadow-lg"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-100 font-display">
                      {item.name}
                    </h3>
                    <span className="font-mono text-sm font-bold text-cyan-300 shrink-0">
                      ${item.price.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {item.description}
                  </p>

                  {/* Variable Hookah Price Input */}
                  {item.id === 'st-hookah' && (
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <span className="text-slate-300 font-medium">Set Hookah Price: $</span>
                      <input
                        type="number"
                        min={1}
                        value={hookahPriceInput}
                        onChange={(e) => setHookahPriceInput(e.target.value)}
                        className="w-24 rounded-lg border border-cyan-500/30 bg-[#060913] px-2.5 py-1 font-mono font-bold text-cyan-300 focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Shisha 100g Flavor Selector */}
                  {item.requiresFlavorSelection && (
                    <div className="mt-3 space-y-1">
                      <label className="block text-[11px] font-semibold text-fuchsia-300">
                        Select 100g Shisha Flavor / Blend:
                      </label>
                      <select
                        value={selectedShishaFlavor}
                        onChange={(e) => setSelectedShishaFlavor(e.target.value)}
                        className="w-full rounded-xl border border-fuchsia-500/30 bg-[#060913] px-3 py-1.5 text-xs text-slate-100 focus:border-fuchsia-400 focus:outline-none"
                      >
                        {availableFlavors.map((f) => (
                          <option key={f.id} value={f.name}>
                            {f.name} {f.nicotineFree ? '(0% Nicotine)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleAddToCart(item)}
                  className="mt-4 flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20 transition-colors"
                >
                  <Plus className="h-4 w-4 text-cyan-400" />
                  Add to Cart
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Counter Cart & Checkout */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-cyan-500/25 bg-[#0B101D] p-4 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-slate-100 font-display flex items-center justify-between">
              <span>Current Cart</span>
              <span className="font-mono text-xs text-cyan-300">
                {cart.reduce((s, i) => s + i.quantity, 0)} items
              </span>
            </h2>

            {cart.length === 0 ? (
              <p className="rounded-xl border border-dashed border-cyan-500/20 p-6 text-center text-xs text-slate-500">
                Cart is empty. Select items on the left to add to sale.
              </p>
            ) : (
              <div className="divide-y divide-cyan-500/15 rounded-xl border border-cyan-500/20 bg-[#060913]">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 p-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-100 truncate">{item.name}</p>
                      {item.flavors && item.flavors.length > 0 && (
                        <p className="text-[11px] text-fuchsia-300">
                          Flavor: {item.flavors.join(', ')}
                        </p>
                      )}
                      <p className="font-mono text-slate-400">
                        ${item.unitPrice.toFixed(2)} ea
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-lg border border-cyan-500/30 bg-[#0B101D]">
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQty(item.id, -1)}
                          className="px-2 py-1 text-slate-300 hover:text-cyan-300"
                        >
                          -
                        </button>
                        <span className="px-1.5 font-mono font-bold text-cyan-200">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateCartQty(item.id, 1)}
                          className="px-2 py-1 text-slate-300 hover:text-cyan-300"
                        >
                          +
                        </button>
                      </div>
                      <span className="font-mono font-bold text-emerald-400 min-w-[50px] text-right">
                        ${(item.unitPrice * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Financial Summary */}
            <div className="space-y-1.5 border-t border-cyan-500/20 pt-3 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal:</span>
                <span className="font-mono text-slate-200">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Sales Tax ({(taxRate * 100).toFixed(1)}%):</span>
                <span className="font-mono text-cyan-300">+${salesTax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-100 pt-1 border-t border-cyan-500/10">
                <span>Total Due:</span>
                <span className="font-mono text-emerald-400">${total.toFixed(2)}</span>
              </div>
            </div>

            {/* Assign / Attach Store Tab to Table */}
            {cart.length > 0 && (
              <div className="space-y-2 border-t border-cyan-500/20 pt-3">
                <label className="block text-xs font-semibold text-cyan-200/80">
                  Attach Store Cart to Table Tab:
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedTargetTableId}
                    onChange={(e) => setSelectedTargetTableId(e.target.value)}
                    className="flex-1 rounded-xl border border-cyan-500/30 bg-[#060913] px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="">-- Select Table to Attach Store Tab --</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.tableNumber ? `#${t.tableNumber} · ${t.name}` : t.name} ({t.floor}) — {t.status === 'occupied' ? 'Occupied Tab' : 'Available (Open New Tab)'}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedTargetTableId}
                    onClick={handleAssignCartToTable}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-cyan-400 px-3.5 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-40 whitespace-nowrap cyber-glow-cyan"
                  >
                    Attach Tab
                  </button>
                </div>
              </div>
            )}

            {/* Direct Counter Sale Checkout */}
            {cart.length > 0 && (
              <div className="space-y-2.5 border-t border-cyan-500/20 pt-3">
                <span className="block text-xs font-semibold text-slate-300">
                  Or Direct Counter Checkout:
                </span>
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-cyan-500/20 bg-[#060913] p-0.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`min-h-[36px] rounded-md text-xs font-bold transition-colors ${
                      paymentMethod === 'card'
                        ? 'bg-cyan-400 text-slate-950'
                        : 'text-slate-400 hover:text-cyan-200'
                    }`}
                  >
                    CARD
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`min-h-[36px] rounded-md text-xs font-bold transition-colors ${
                      paymentMethod === 'cash'
                        ? 'bg-cyan-400 text-slate-950'
                        : 'text-slate-400 hover:text-cyan-200'
                    }`}
                  >
                    CASH
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCounterCheckout}
                  className={`flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-slate-950 transition-colors ${
                    confirmCheckout
                      ? 'bg-emerald-300 hover:bg-emerald-200 cyber-glow-emerald'
                      : 'bg-emerald-400 hover:bg-emerald-300 cyber-glow-emerald'
                  }`}
                >
                  <Receipt className="h-4 w-4" />
                  {confirmCheckout
                    ? `Confirm ${paymentMethod.toUpperCase()} ($${total.toFixed(2)})`
                    : 'Complete Counter Sale'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal for Custom Store Item */}
      {isAddCustomOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setIsAddCustomOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-cyan-500/30 bg-[#0A0F1C] p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-slate-100 font-display">
              Add Custom Retail Store Item
            </h3>

            <form onSubmit={handleAddCustomItem} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Custom Glass Bowl, Leather Hose"
                  className="w-full min-h-[42px] rounded-xl border border-cyan-500/30 bg-[#060913] px-3.5 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="e.g. 25.00"
                  className="w-full min-h-[42px] rounded-xl border border-cyan-500/30 bg-[#060913] px-3.5 py-2 font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={customTaxable}
                  onChange={(e) => setCustomTaxable(e.target.checked)}
                  className="h-4 w-4 rounded border-cyan-500/40 bg-slate-900 accent-cyan-400"
                />
                Include Sales Tax ({(taxRate * 100).toFixed(1)}%)
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCustomOpen(false)}
                  className="flex-1 min-h-[44px] rounded-xl border border-cyan-500/30 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!customName.trim()}
                  className="flex-1 min-h-[44px] rounded-xl bg-cyan-400 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-40"
                >
                  Add Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

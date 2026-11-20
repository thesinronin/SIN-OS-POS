import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createInitialFlavors,
  createInitialTables,
  DEFAULT_SETTINGS,
  getTableSeatingTier,
  getVipUpgradeOption,
} from '../data/menu';
import {
  getSavedLayoutTemplate,
  saveLayoutToLocalStorage,
} from '../services/templateManager';
import type {
  ActiveStaffMember,
  BatchReport,
  CompletedSession,
  FlavorCategory,
  FlavorOption,
  LoungeReservation,
  LoungeSettings,
  LoungeStateSnapshot,
  LoungeTable,
  OrderItem,
  PaymentMethod,
  PrepStatus,
  ReservationStatus,
  SeatingTierId,
  StaffProfile,
  TableFloor,
  TableShape,
  TableZone,
} from '../types';

type OutgoingAction = {
  type: string;
  [key: string]: unknown;
};

function sanitizeTable(t: LoungeTable): LoungeTable {
  return {
    ...t,
    orders: Array.isArray(t?.orders) ? t.orders : [],
    parties: Array.isArray(t?.parties) ? t.parties : undefined,
  };
}

export function useLoungeSync(staff: StaffProfile) {
  const [tables, setTables] = useState<LoungeTable[]>(() => {
    const saved = getSavedLayoutTemplate();
    if (saved && Array.isArray(saved.tables) && saved.tables.length > 0) {
      return saved.tables;
    }
    return createInitialTables();
  });
  const [history, setHistory] = useState<CompletedSession[]>([]);
  const [settings, setSettings] = useState<LoungeSettings>(DEFAULT_SETTINGS);
  const [activeStaff, setActiveStaff] = useState<ActiveStaffMember[]>([]);
  const [lastBatchReport, setLastBatchReport] = useState<BatchReport | null>(null);
  const [flavors, setFlavors] = useState<FlavorOption[]>(() => {
    const saved = getSavedLayoutTemplate();
    if (saved && Array.isArray(saved.flavors) && saved.flavors.length > 0) {
      return saved.flavors;
    }
    return createInitialFlavors();
  });
  const [reservations, setReservations] = useState<LoungeReservation[]>([]);
  const [connectionState, setConnectionState] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const pendingQueueRef = useRef<OutgoingAction[]>([]);
  const staffRef = useRef(staff);
  staffRef.current = staff;
  const tablesRef = useRef(tables);
  tablesRef.current = tables;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const sendAction = useCallback((action: OutgoingAction) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(action));
    } else {
      pendingQueueRef.current.push(action);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const rawIp = settingsRef.current?.syncServerIp?.trim();
    const cleanHost = rawIp
      ? rawIp.replace(/^https?:\/\//, '').replace(/\/$/, '')
      : window.location.host;

    const hasPort = cleanHost.includes(':');
    const finalHost = !hasPort ? `${cleanHost}:3000` : cleanHost;

    const isExplicitHttps = rawIp?.startsWith('https://') || false;
    const httpProtocol = isExplicitHttps ? 'https:' : 'http:';
    const wsProtocol = isExplicitHttps ? 'wss:' : 'ws:';

    const httpUrl = `${httpProtocol}//${finalHost}/api/state`;
    const wsUrl = `${wsProtocol}//${finalHost}/ws`;

    fetch(httpUrl)
      .then((res) => {
        const contentType = res.headers.get('content-type') || '';
        return res.ok && contentType.includes('application/json') ? res.json() : null;
      })
      .then((snapshot: LoungeStateSnapshot | null) => {
        if (!disposed && snapshot && Array.isArray(snapshot.tables)) {
          setTables(snapshot.tables.map(sanitizeTable));
          setHistory(snapshot.history || []);
          setSettings((prev) => ({
            ...DEFAULT_SETTINGS,
            ...prev,
            ...snapshot.settings,
            syncServerIp: prev.syncServerIp || snapshot.settings?.syncServerIp || '',
          }));
          setActiveStaff(snapshot.activeStaff || []);
          setLastBatchReport(snapshot.lastBatchReport ?? null);
          if (Array.isArray(snapshot.flavors) && snapshot.flavors.length > 0) {
            setFlavors(snapshot.flavors);
          }
          if (Array.isArray(snapshot.reservations)) {
            setReservations(snapshot.reservations);
          }
        }
      })
      .catch(() => {});

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        reconnectAttempt = 0;
        setConnectionState('live');

        ws.send(
          JSON.stringify({
            type: 'staff:join',
            clientId: staffRef.current.clientId,
            name: staffRef.current.name,
            role: staffRef.current.role,
          })
        );

        if (pendingQueueRef.current.length > 0) {
          const queued = [...pendingQueueRef.current];
          pendingQueueRef.current = [];
          for (const msg of queued) {
            ws.send(JSON.stringify(msg));
          }
        }
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const msg = JSON.parse(event.data) as {
            type: string;
            snapshot?: LoungeStateSnapshot;
            table?: LoungeTable;
            tableId?: string;
            session?: CompletedSession;
            settings?: LoungeSettings;
            activeStaff?: ActiveStaffMember[];
            flavors?: FlavorOption[];
          };

          switch (msg.type) {
            case 'state:init':
              if (msg.snapshot && Array.isArray(msg.snapshot.tables)) {
                setTables(msg.snapshot.tables.map(sanitizeTable));
                setHistory(msg.snapshot.history || []);
                setSettings((prev) => ({
                  ...DEFAULT_SETTINGS,
                  ...prev,
                  ...msg.snapshot?.settings,
                  syncServerIp: prev.syncServerIp || msg.snapshot?.settings?.syncServerIp || '',
                }));
                setActiveStaff(msg.snapshot.activeStaff || []);
                setLastBatchReport(msg.snapshot.lastBatchReport ?? null);
                if (Array.isArray(msg.snapshot.flavors)) {
                  setFlavors(msg.snapshot.flavors);
                }
                if (Array.isArray(msg.snapshot.reservations)) {
                  setReservations(msg.snapshot.reservations);
                }
              }
              break;
            case 'table:updated':
              if (msg.table) {
                const incoming = sanitizeTable(msg.table);
                setTables((prev) => {
                  const idx = prev.findIndex((t) => t.id === incoming.id);
                  if (idx === -1) return [...prev, incoming];
                  const next = [...prev];
                  next[idx] = incoming;
                  return next;
                });
              }
              break;
            case 'table:deleted':
              if (msg.tableId) {
                setTables((prev) => prev.filter((t) => t.id !== msg.tableId));
              }
              break;
            case 'session:completed':
              if (msg.session) {
                const incoming = msg.session;
                setHistory((prev) =>
                  prev.some((s) => s.id === incoming.id) ? prev : [incoming, ...prev]
                );
              }
              break;
            case 'settings:updated':
              if (msg.settings) {
                setSettings((prev) => ({
                  ...prev,
                  ...msg.settings,
                  syncServerIp: prev.syncServerIp || msg.settings?.syncServerIp || '',
                }));
              }
              break;
            case 'staff:presence':
              if (msg.activeStaff) {
                setActiveStaff(msg.activeStaff);
              }
              break;
            case 'flavors:updated':
              if (Array.isArray(msg.flavors)) {
                setFlavors(msg.flavors);
              }
              break;
            case 'reservations:updated':
              if (Array.isArray(msg.reservations)) {
                setReservations(msg.reservations as LoungeReservation[]);
              }
              break;
          }
        } catch {
          // Ignore malformed message
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        reconnectAttempt += 1;
        if (reconnectAttempt > 2 && !settingsRef.current?.syncServerIp) {
          setConnectionState('local');
        } else {
          setConnectionState('reconnecting');
        }
        const delay = Math.min(8000, 1000 * Math.pow(1.5, Math.min(reconnectAttempt, 5)));
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    // 3-second HTTP Polling Fallback (Guarantees 100% sync over Wi-Fi even if WebSocket is blocked by Firewall)
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    if (rawIp) {
      pollInterval = setInterval(() => {
        if (disposed) return;
        fetch(httpUrl)
          .then((res) => (res.ok ? res.json() : null))
          .then((snapshot: LoungeStateSnapshot | null) => {
            if (!disposed && snapshot && Array.isArray(snapshot.tables)) {
              setTables(snapshot.tables);
              setHistory(snapshot.history || []);
              setSettings((prev) => ({ ...DEFAULT_SETTINGS, ...prev, ...snapshot.settings }));
              setActiveStaff(snapshot.activeStaff || []);
              setLastBatchReport(snapshot.lastBatchReport ?? null);
              if (Array.isArray(snapshot.flavors) && snapshot.flavors.length > 0) {
                setFlavors(snapshot.flavors);
              }
              setConnectionState('live');
            }
          })
          .catch(() => {});
      }, 3000);
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollInterval) clearInterval(pollInterval);
      wsRef.current?.close();
    };
  }, [settings.syncServerIp]);

  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'staff:join',
          clientId: staff.clientId,
          name: staff.name,
          role: staff.role,
        })
      );
    }
  }, [staff.clientId, staff.name, staff.role]);

  const seatTable = useCallback(
    (
      tableId: string,
      partySize: number,
      guestName: string,
      initialOrders: OrderItem[] = [],
      seatingTier?: SeatingTierId,
      timeLimitMinutes?: number,
      tableNumber?: string
    ) => {
      const now = Date.now();
      const cleanTableNum = tableNumber?.trim() || undefined;
      const enrichedOrders = initialOrders.map((o) => ({
        ...o,
        addedBy: o.addedBy || staffRef.current.name,
      }));
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? {
                ...t,
                status: 'occupied',
                tableNumber: cleanTableNum !== undefined ? cleanTableNum : t.tableNumber,
                seatingTier,
                timeLimitMinutes,
                partySize,
                guestName: guestName.trim() || undefined,
                serverName: staffRef.current.name,
                seatedAt: now,
                lastCoalCheckAt: now,
                orders: enrichedOrders,
                updatedAt: now,
              }
            : t
        )
      );
      sendAction({
        type: 'table:seat',
        tableId,
        partySize,
        guestName,
        tableNumber: cleanTableNum,
        serverName: staffRef.current.name,
        initialOrders: enrichedOrders,
        seatingTier,
        timeLimitMinutes,
      });
    },
    [sendAction]
  );

  const seatAnotherParty = useCallback(
    (
      tableId: string,
      partySize: number,
      guestName: string,
      initialOrders: OrderItem[] = []
    ) => {
      const now = Date.now();
      const enrichedOrders = initialOrders.map((o) => ({
        ...o,
        addedBy: o.addedBy || staffRef.current.name,
      }));
      setTables((prev) =>
        prev.map((t) => {
          if (t.id !== tableId) return t;
          const existingParties = t.parties || [
            {
              id: `party-primary-${t.seatedAt || now}`,
              partySize: t.partySize || 1,
              guestName: t.guestName,
              seatedAt: t.seatedAt || now,
              orders: t.orders,
            },
          ];
          const newParty = {
            id: `party-${now}-${Math.random().toString(36).slice(2, 6)}`,
            partySize,
            guestName: guestName.trim() || undefined,
            seatedAt: now,
            orders: enrichedOrders,
          };
          const nextParties = [...existingParties, newParty];
          const combinedPartySize = nextParties.reduce((sum, p) => sum + p.partySize, 0);
          const combinedGuestNames = nextParties
            .map((p) => p.guestName)
            .filter(Boolean)
            .join(', ');
          const combinedOrders = [...t.orders, ...enrichedOrders];
          return {
            ...t,
            partySize: combinedPartySize,
            guestName: combinedGuestNames || undefined,
            orders: combinedOrders,
            parties: nextParties,
            updatedAt: now,
          };
        })
      );
      sendAction({
        type: 'table:seatAnotherParty',
        tableId,
        partySize,
        guestName,
        initialOrders: enrichedOrders,
      });
    },
    [sendAction]
  );

  const updateTableNumber = useCallback(
    (tableId: string, tableNumber: string) => {
      const clean = tableNumber.trim() || undefined;
      const now = Date.now();
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId ? { ...t, tableNumber: clean, updatedAt: now } : t
        )
      );
      sendAction({
        type: 'table:updateNumber',
        tableId,
        tableNumber: clean || '',
      });
    },
    [sendAction]
  );

  const updatePartySize = useCallback(
    (tableId: string, partySize: number) => {
      const nextSize = Math.max(1, Math.min(50, Math.round(partySize || 1)));
      const now = Date.now();
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId ? { ...t, partySize: nextSize, updatedAt: now } : t
        )
      );
      sendAction({
        type: 'table:updatePartySize',
        tableId,
        partySize: nextSize,
      });
    },
    [sendAction]
  );

  const addOrder = useCallback(
    (tableId: string, item: OrderItem) => {
      const now = Date.now();
      const enriched: OrderItem = { ...item, addedBy: staffRef.current.name };
      setTables((prev) =>
        prev.map((t) => {
          if (t.id !== tableId) return t;
          if (t.orders.some((o) => o.id === enriched.id)) return t;
          return {
            ...t,
            lastCoalCheckAt:
              enriched.category === 'hookah' || enriched.category === 'refill'
                ? now
                : t.lastCoalCheckAt,
            orders: [...t.orders, enriched],
            updatedAt: now,
          };
        })
      );
      sendAction({ type: 'table:addOrder', tableId, item: enriched });
    },
    [sendAction]
  );

  const updateOrderQty = useCallback(
    (tableId: string, orderId: string, delta: number) => {
      const now = Date.now();
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? {
                ...t,
                orders: t.orders
                  .map((o) =>
                    o.id === orderId ? { ...o, quantity: o.quantity + delta } : o
                  )
                  .filter((o) => o.quantity > 0),
                updatedAt: now,
              }
            : t
        )
      );
      sendAction({ type: 'table:updateQty', tableId, orderId, delta });
    },
    [sendAction]
  );

  const updateOrderPrice = useCallback(
    (tableId: string, orderId: string, unitPrice: number) => {
      const nextPrice = Math.max(0, Number(unitPrice) || 0);
      const now = Date.now();
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? {
                ...t,
                orders: t.orders.map((o) =>
                  o.id === orderId ? { ...o, unitPrice: nextPrice } : o
                ),
                updatedAt: now,
              }
            : t
        )
      );
      sendAction({
        type: 'table:updateOrderPrice',
        tableId,
        orderId,
        unitPrice: nextPrice,
      });
    },
    [sendAction]
  );

  const refreshCoals = useCallback(
    (tableId: string) => {
      const now = Date.now();
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId ? { ...t, lastCoalCheckAt: now, updatedAt: now } : t
        )
      );
      sendAction({ type: 'table:refreshCoals', tableId });
    },
    [sendAction]
  );

  const advancePrep = useCallback(
    (tableId: string, orderId: string, nextStatus: PrepStatus) => {
      const now = Date.now();
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? {
                ...t,
                orders: t.orders.map((o) =>
                  o.id === orderId ? { ...o, prepStatus: nextStatus } : o
                ),
                updatedAt: now,
              }
            : t
        )
      );
      sendAction({ type: 'table:advancePrep', tableId, orderId, nextStatus });
    },
    [sendAction]
  );

  const checkoutTable = useCallback(
    (
      tableId: string,
      payment?: {
        paymentMethod?: PaymentMethod;
        cashPaid?: number;
        cardPaid?: number;
        splitWays?: number;
        discount?: number;
      }
    ) => {
      const now = Date.now();
      const target = tables.find((t) => t.id === tableId);
      const paymentMethod: PaymentMethod = payment?.paymentMethod ?? 'card';
      const discount = payment?.discount ?? 0;
      if (target && target.seatedAt) {
        const subtotal = target.orders.reduce(
          (s, o) => s + o.unitPrice * o.quantity,
          0
        );
        const tax = 0;
        const total = Math.max(0, subtotal - discount);
        const cashPaid =
          paymentMethod === 'cash'
            ? total
            : paymentMethod === 'split'
            ? Math.max(0, Math.min(total, Number(payment?.cashPaid) || 0))
            : 0;
        const cardPaid =
          paymentMethod === 'card'
            ? total
            : Math.max(0, Number((total - cashPaid).toFixed(2)));
        const localSess: CompletedSession = {
          id: `sess-${now}-${target.id}`,
          tableName: target.tableNumber
            ? `#${target.tableNumber} · ${target.name}`
            : target.name,
          floor: target.floor,
          zone: target.zone,
          partySize: target.partySize || 1,
          guestName: target.guestName,
          serverName: target.serverName || staffRef.current.name,
          seatedAt: target.seatedAt,
          closedAt: now,
          durationMinutes: Math.max(
            1,
            Math.round((now - target.seatedAt) / 60_000)
          ),
          orders: target.orders,
          subtotal,
          discount: discount > 0 ? discount : undefined,
          tax,
          total,
          paymentMethod,
          cashPaid,
          cardPaid,
          splitWays: payment?.splitWays,
        };
        setHistory((prev) => [localSess, ...prev]);
      }

      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? {
                ...t,
                status: 'available',
                tableNumber: undefined,
                seatingTier: undefined,
                timeLimitMinutes: undefined,
                partySize: undefined,
                guestName: undefined,
                serverName: undefined,
                seatedAt: undefined,
                lastCoalCheckAt: undefined,
                orders: [],
                parties: undefined,
                updatedAt: now,
              }
            : t
        )
      );
      sendAction({
        type: 'table:checkout',
        tableId,
        staffName: staffRef.current.name,
        paymentMethod,
        cashPaid: payment?.cashPaid,
        splitWays: payment?.splitWays,
      });
    },
    [sendAction, tables]
  );

  const checkoutParty = useCallback(
    (
      tableId: string,
      partyId: string,
      payment?: {
        paymentMethod?: PaymentMethod;
        cashPaid?: number;
        cardPaid?: number;
        splitWays?: number;
        discount?: number;
      }
    ) => {
      const now = Date.now();
      const target = tables.find((t) => t.id === tableId);
      if (!target || !target.parties || target.parties.length === 0) {
        checkoutTable(tableId, payment);
        return;
      }

      const partyToCheckout = target.parties.find((p) => p.id === partyId);
      if (!partyToCheckout) return;

      const remainingParties = target.parties.filter((p) => p.id !== partyId);
      const paymentMethod: PaymentMethod = payment?.paymentMethod ?? 'card';
      const discount = payment?.discount ?? 0;
      const subtotal = partyToCheckout.orders.reduce(
        (s, o) => s + o.unitPrice * o.quantity,
        0
      );
      const total = Math.max(0, subtotal - discount);
      const cashPaid =
        paymentMethod === 'cash'
          ? total
          : paymentMethod === 'split'
          ? Math.max(0, Math.min(total, Number(payment?.cashPaid) || 0))
          : 0;
      const cardPaid =
        paymentMethod === 'card'
          ? total
          : Math.max(0, Number((total - cashPaid).toFixed(2)));

      const localSess: CompletedSession = {
        id: `sess-${now}-${partyToCheckout.id}`,
        tableName: target.tableNumber
          ? `#${target.tableNumber} · ${target.name} (${partyToCheckout.guestName || 'Party Tab'})`
          : `${target.name} (${partyToCheckout.guestName || 'Party Tab'})`,
        floor: target.floor,
        zone: target.zone,
        partySize: partyToCheckout.partySize || 1,
        guestName: partyToCheckout.guestName,
        serverName: target.serverName || staffRef.current.name,
        seatedAt: partyToCheckout.seatedAt || target.seatedAt || now,
        closedAt: now,
        durationMinutes: Math.max(
          1,
          Math.round((now - (partyToCheckout.seatedAt || target.seatedAt || now)) / 60_000)
        ),
        orders: partyToCheckout.orders,
        subtotal,
        discount: discount > 0 ? discount : undefined,
        tax: 0,
        total,
        paymentMethod,
        cashPaid,
        cardPaid,
        splitWays: payment?.splitWays,
      };

      setHistory((prev) => [localSess, ...prev]);

      setTables((prev) =>
        prev.map((t) => {
          if (t.id !== tableId) return t;
          if (remainingParties.length === 0) {
            return {
              ...t,
              status: 'available',
              tableNumber: undefined,
              seatingTier: undefined,
              timeLimitMinutes: undefined,
              partySize: undefined,
              guestName: undefined,
              serverName: undefined,
              seatedAt: undefined,
              lastCoalCheckAt: undefined,
              orders: [],
              parties: undefined,
              updatedAt: now,
            };
          }

          const checkedOutOrderIds = new Set(partyToCheckout.orders.map((o) => o.id));
          const remainingOrders = t.orders.filter((o) => !checkedOutOrderIds.has(o.id));
          const combinedPartySize = remainingParties.reduce((sum, p) => sum + p.partySize, 0);
          const combinedGuestNames = remainingParties.map((p) => p.guestName).filter(Boolean).join(', ');

          return {
            ...t,
            partySize: combinedPartySize,
            guestName: combinedGuestNames || undefined,
            orders: remainingOrders,
            parties: remainingParties,
            updatedAt: now,
          };
        })
      );

      sendAction({
        type: 'table:checkoutParty',
        tableId,
        partyId,
        staffName: staffRef.current.name,
        paymentMethod,
        cashPaid: payment?.cashPaid,
        splitWays: payment?.splitWays,
      });
    },
    [checkoutTable, sendAction, tables]
  );

  const transferTable = useCallback(
    (fromTableId: string, toTableId: string, upgradeToVip = false) => {
      const now = Date.now();
      setTables((prev) => {
        const fromTable = prev.find((t) => t.id === fromTableId);
        const toTable = prev.find((t) => t.id === toTableId);
        if (
          !fromTable ||
          !toTable ||
          fromTable.id === toTable.id ||
          fromTable.status !== 'occupied' ||
          toTable.status !== 'available'
        ) {
          return prev;
        }
        const movedOrders = [...fromTable.orders];
        const currentTier = getTableSeatingTier(fromTable);
        const upgradeOpt = getVipUpgradeOption(currentTier.id);
        let nextTier = fromTable.seatingTier;
        let nextLimit = fromTable.timeLimitMinutes;
        if (upgradeToVip && upgradeOpt) {
          movedOrders.push({
            id: `ord-${now}-${Math.random().toString(36).slice(2, 7)}-vip`,
            menuItemId: upgradeOpt.menuItemId,
            name: upgradeOpt.label,
            category: 'refill',
            unitPrice: upgradeOpt.price,
            quantity: 1,
            notes: `Transferred & upgraded from ${fromTable.name}`,
            addedBy: staffRef.current.name,
            prepStatus: 'served',
            orderedAt: now,
          });
          nextTier = 'vip_allday';
          nextLimit = undefined;
        }

        return prev.map((t) => {
          if (t.id === fromTableId) {
            return {
              ...t,
              status: 'available',
              seatingTier: undefined,
              timeLimitMinutes: undefined,
              partySize: undefined,
              guestName: undefined,
              serverName: undefined,
              seatedAt: undefined,
              lastCoalCheckAt: undefined,
              orders: [],
              updatedAt: now,
            };
          }
          if (t.id === toTableId) {
            return {
              ...t,
              status: 'occupied',
              seatingTier: nextTier,
              timeLimitMinutes: nextLimit,
              partySize: fromTable.partySize,
              guestName: fromTable.guestName,
              serverName: fromTable.serverName || staffRef.current.name,
              seatedAt: fromTable.seatedAt || now,
              lastCoalCheckAt: fromTable.lastCoalCheckAt || now,
              orders: movedOrders,
              updatedAt: now,
            };
          }
          return t;
        });
      });

      sendAction({
        type: 'table:transfer',
        fromTableId,
        toTableId,
        upgradeToVip,
        staffName: staffRef.current.name,
      });
    },
    [sendAction]
  );

  const markOrdersPrinted = useCallback(
    (tableId: string, orderIds: string[]) => {
      const now = Date.now();
      const idSet = new Set(orderIds);
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? {
                ...t,
                orders: t.orders.map((o) =>
                  idSet.size === 0 || idSet.has(o.id)
                    ? { ...o, kitchenPrintedAt: now }
                    : o
                ),
                updatedAt: now,
              }
            : t
        )
      );
      sendAction({ type: 'table:markPrinted', tableId, orderIds });
    },
    [sendAction]
  );

  const upgradeToVip = useCallback(
    (tableId: string) => {
      const targetTable = tablesRef.current.find((t) => t.id === tableId);
      const currentTier = targetTable ? getTableSeatingTier(targetTable) : null;
      const upgradeOpt = currentTier ? getVipUpgradeOption(currentTier.id) : null;
      if (!upgradeOpt) return;

      const now = Date.now();
      const item: OrderItem = {
        id: `ord-${now}-${Math.random().toString(36).slice(2, 7)}-vip`,
        menuItemId: upgradeOpt.menuItemId,
        name: upgradeOpt.label,
        category: 'refill',
        unitPrice: upgradeOpt.price,
        quantity: 1,
        notes: `Upgraded ${currentTier?.shortLabel || 'table'} to All Day VIP`,
        addedBy: staffRef.current.name,
        prepStatus: 'served',
        orderedAt: now,
      };

      setTables((prev) =>
        prev.map((t) => {
          if (t.id !== tableId) return t;
          return {
            ...t,
            seatingTier: 'vip_allday',
            timeLimitMinutes: undefined,
            orders: t.orders.some((o) => o.id === item.id)
              ? t.orders
              : [...t.orders, item],
            updatedAt: now,
          };
        })
      );

      sendAction({
        type: 'table:upgradeVip',
        tableId,
        item,
      });
    },
    [sendAction]
  );

  const updateOrderFlavors = useCallback(
    (tableId: string, orderId: string, nextFlavors: string[]) => {
      const sanitized = nextFlavors
        .map((f) => f.trim())
        .filter(Boolean)
        .slice(0, 3);
      const now = Date.now();
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? {
                ...t,
                orders: t.orders.map((o) =>
                  o.id === orderId
                    ? {
                        ...o,
                        flavors: sanitized.length > 0 ? sanitized : undefined,
                      }
                    : o
                ),
                updatedAt: now,
              }
            : t
        )
      );
      sendAction({
        type: 'table:updateOrderFlavors',
        tableId,
        orderId,
        flavors: sanitized,
      });
    },
    [sendAction]
  );

  const addFlavor = useCallback(
    (
      name: string,
      category: FlavorCategory = 'flavor',
      recipe?: string,
      nicotineFree?: boolean
    ) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const cleanRecipe = recipe?.trim() || undefined;
      setFlavors((prev) => {
        const existing = prev.find(
          (f) => f.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (existing) {
          return prev.map((f) =>
            f.id === existing.id
              ? {
                  ...f,
                  available: true,
                  category,
                  recipe: cleanRecipe !== undefined ? cleanRecipe : f.recipe,
                  nicotineFree: nicotineFree ?? f.nicotineFree,
                }
              : f
          );
        }
        return [
          ...prev,
          {
            id: `${category === 'blend' ? 'bld' : 'flv'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: trimmed,
            available: true,
            category,
            recipe: cleanRecipe,
            nicotineFree,
          },
        ];
      });
      sendAction({
        type: 'flavors:add',
        name: trimmed,
        category,
        recipe: cleanRecipe,
        nicotineFree,
      });
    },
    [sendAction]
  );

  const toggleFlavorAvailability = useCallback(
    (flavorId: string) => {
      setFlavors((prev) =>
        prev.map((f) =>
          f.id === flavorId ? { ...f, available: !f.available } : f
        )
      );
      sendAction({ type: 'flavors:toggle', flavorId });
    },
    [sendAction]
  );

  const removeFlavor = useCallback(
    (flavorId: string) => {
      setFlavors((prev) => prev.filter((f) => f.id !== flavorId));
      sendAction({ type: 'flavors:remove', flavorId });
    },
    [sendAction]
  );

  const moveTable = useCallback(
    (tableId: string, x: number, y: number) => {
      const now = Date.now();
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId ? { ...t, x, y, updatedAt: now } : t
        )
      );
      sendAction({ type: 'layout:moveTable', tableId, x, y });
    },
    [sendAction]
  );

  const saveTableLayout = useCallback(
    (data: {
      id?: string;
      name: string;
      tableNumber?: string;
      floor: TableFloor;
      zone: TableZone;
      seats: number;
      shape: TableShape;
      rotation?: number;
    }) => {
      const now = Date.now();
      const cleanTableNum = data.tableNumber?.trim() || undefined;
      const cleanName =
        data.name.trim() || (cleanTableNum ? `Table ${cleanTableNum}` : '');
      if (!cleanName) return;

      if (data.id) {
        setTables((prev) =>
          prev.map((t) =>
            t.id === data.id
              ? {
                  ...t,
                  name: cleanName,
                  tableNumber: cleanTableNum,
                  floor: data.floor,
                  zone: data.zone,
                  seats: Math.max(1, data.seats || 4),
                  shape: data.shape,
                  rotation: data.rotation ?? t.rotation,
                  updatedAt: now,
                }
              : t
          )
        );
        sendAction({
          type: 'layout:saveTable',
          data: { ...data, name: cleanName, tableNumber: cleanTableNum },
        });
        return;
      }

      const newId = `t-${now}-${Math.random().toString(36).slice(2, 6)}`;
      setTables((prev) => {
        if (prev.some((t) => t.id === newId)) return prev;
        const floorTables = prev.filter((t) => t.floor === data.floor);
        const idx = floorTables.length;
        const col = idx % 3;
        const row = Math.floor(idx / 3) % 4;
        const newTable: LoungeTable = {
          id: newId,
          name: cleanName,
          tableNumber: cleanTableNum,
          floor: data.floor,
          zone: data.zone,
          seats: Math.max(1, data.seats || 4),
          shape: data.shape,
          rotation: data.rotation || 0,
          x: Math.min(72, 6 + col * 30),
          y: Math.min(72, 10 + row * 26),
          status: 'available',
          orders: [],
          updatedAt: now,
        };
        return [...prev, newTable];
      });
      sendAction({
        type: 'layout:saveTable',
        data: { ...data, newId, name: cleanName, tableNumber: cleanTableNum },
      });
    },
    [sendAction]
  );

  const deleteTable = useCallback(
    (tableId: string) => {
      setTables((prev) => prev.filter((t) => t.id !== tableId));
      sendAction({ type: 'layout:deleteTable', tableId });
    },
    [sendAction]
  );

  const updateSettings = useCallback(
    (nextSettings: LoungeSettings) => {
      setSettings(nextSettings);
      sendAction({ type: 'settings:update', settings: nextSettings });
    },
    [sendAction]
  );

  const batchOutShift = useCallback(async (): Promise<BatchReport | null> => {
    const now = Date.now();
    const staffName = staffRef.current.name || 'Manager';

    const autoClosedSessions: CompletedSession[] = tables
      .filter((t) => t.status === 'occupied')
      .map((t) => {
        const seatedAt = t.seatedAt || now;
        const sub = t.orders.reduce((s, o) => s + o.unitPrice * o.quantity, 0);
        const tax = 0;
        return {
          id: `sess-${now}-${t.id}`,
          tableName: t.name,
          floor: t.floor,
          zone: t.zone,
          partySize: t.partySize || 1,
          guestName: t.guestName,
          serverName: t.serverName || staffName,
          seatedAt,
          closedAt: now,
          durationMinutes: Math.max(1, Math.round((now - seatedAt) / 60_000)),
          orders: t.orders,
          subtotal: sub,
          tax,
          total: sub,
          paymentMethod: 'card',
          cashPaid: 0,
          cardPaid: sub,
        };
      });

    const allDaySessions = [...autoClosedSessions, ...history];
    const subtotal = allDaySessions.reduce((s, x) => s + x.subtotal, 0);
    const tax = allDaySessions.reduce((s, x) => s + x.tax, 0);
    const total = allDaySessions.reduce((s, x) => s + x.total, 0);
    const cashTotal = allDaySessions.reduce(
      (s, x) => s + (x.cashPaid ?? (x.paymentMethod === 'cash' ? x.total : 0)),
      0
    );
    const cardTotal = allDaySessions.reduce(
      (s, x) =>
        s +
        (x.cardPaid ??
          (x.paymentMethod === 'cash' ? 0 : x.total - (x.cashPaid ?? 0))),
      0
    );

    const optimisticReport: BatchReport = {
      id: `batch-${now}`,
      closedAt: now,
      closedBy: staffName,
      totalTabs: allDaySessions.length,
      autoClosedOpenTables: autoClosedSessions.length,
      subtotal,
      tax,
      total,
      cashTotal,
      cardTotal,
      sessions: allDaySessions,
    };

    setTables((prev) =>
      prev.map((t) =>
        t.status === 'occupied'
          ? {
              ...t,
              status: 'available',
              seatingTier: undefined,
              timeLimitMinutes: undefined,
              partySize: undefined,
              guestName: undefined,
              serverName: undefined,
              seatedAt: undefined,
              lastCoalCheckAt: undefined,
              orders: [],
              updatedAt: now,
            }
          : t
      )
    );
    setHistory([]);
    setLastBatchReport(optimisticReport);

    try {
      const res = await fetch('/api/shift/batch-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffName }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          ok: boolean;
          report?: BatchReport;
          snapshot?: LoungeStateSnapshot;
        };
        if (data.snapshot && Array.isArray(data.snapshot.tables)) {
          setTables(data.snapshot.tables);
          setHistory(data.snapshot.history || []);
          setSettings(data.snapshot.settings || DEFAULT_SETTINGS);
          setActiveStaff(data.snapshot.activeStaff || []);
          setLastBatchReport(data.snapshot.lastBatchReport ?? data.report ?? optimisticReport);
        }
        return data.report ?? optimisticReport;
      }
    } catch {
      // Fall back to WebSocket mutation below
    }

    sendAction({
      type: 'shift:batchOut',
      staffName,
    });
    return optimisticReport;
  }, [tables, history, sendAction]);

  const resetDemo = useCallback(() => {
    sendAction({ type: 'state:resetDemo' });
  }, [sendAction]);

  const applyTemplate = useCallback(
    (templateTables: LoungeTable[], templateFlavors: FlavorOption[]) => {
      const now = Date.now();
      const freshTables = templateTables.map((t) => ({
        ...t,
        status: 'available' as const,
        orders: [],
        parties: undefined,
        seatedAt: undefined,
        partySize: undefined,
        guestName: undefined,
        updatedAt: now,
      }));
      setTables(freshTables);
      setFlavors(templateFlavors);
      saveLayoutToLocalStorage(freshTables, templateFlavors);
      sendAction({
        type: 'template:apply',
        tables: freshTables,
        flavors: templateFlavors,
      });
    },
    [sendAction]
  );

  const addReservation = useCallback(
    (data: Omit<LoungeReservation, 'id' | 'createdAt'>) => {
      const now = Date.now();
      const newRes: LoungeReservation = {
        ...data,
        id: `res-${now}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: now,
      };
      setReservations((prev) => [newRes, ...prev]);
      sendAction({ type: 'reservations:add', reservation: newRes });
    },
    [sendAction]
  );

  const updateReservationStatus = useCallback(
    (id: string, status: ReservationStatus, tableId?: string) => {
      setReservations((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, status, assignedTableId: tableId ?? r.assignedTableId } : r
        )
      );
      sendAction({ type: 'reservations:updateStatus', id, status, tableId });
    },
    [sendAction]
  );

  const deleteReservation = useCallback(
    (id: string) => {
      setReservations((prev) => prev.filter((r) => r.id !== id));
      sendAction({ type: 'reservations:delete', id });
    },
    [sendAction]
  );

  return {
    tables,
    history,
    settings,
    activeStaff,
    lastBatchReport,
    flavors,
    reservations,
    connectionState,
    seatTable,
    seatAnotherParty,
    updateTableNumber,
    updatePartySize,
    addOrder,
    updateOrderQty,
    updateOrderPrice,
    refreshCoals,
    advancePrep,
    checkoutTable,
    checkoutParty,
    transferTable,
    markOrdersPrinted,
    upgradeToVip,
    updateOrderFlavors,
    addFlavor,
    toggleFlavorAvailability,
    removeFlavor,
    moveTable,
    saveTableLayout,
    deleteTable,
    updateSettings,
    batchOutShift,
    resetDemo,
    applyTemplate,
    addReservation,
    updateReservationStatus,
    deleteReservation,
  };
}

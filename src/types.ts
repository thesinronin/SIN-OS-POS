export type TableFloor = 'Floor 1' | 'Floor 2' | 'Outside';
export type TableZone = 'Lounge' | 'VIP' | 'Bar' | 'Patio';
export type TableStatus = 'available' | 'occupied';
export type TableShape = 'square' | 'round' | 'booth';
export type PrepStatus = 'queued' | 'prepping' | 'served';
export type MenuCategory = 'hookah' | 'refill' | 'store';
export type AppTheme = 'cyberpunk' | 'startrek' | 'lotr' | 'barney' | 'bit8';
export type AlertMode = 'chime_voice' | 'chime_only' | 'silent';
export type StaffRole = 'Server' | 'Hookah Master' | 'Manager';
export type SeatingTierId =
  | 'vip_allday'
  | 'vip_onetime'
  | 'bar_allday'
  | 'bar_onetime'
  | 'downstairs';
export type PrinterMode = 'system' | 'network' | 'bluetooth';
export type PrinterPaperWidth = '80mm' | '58mm';
export type PaymentMethod = 'card' | 'cash' | 'split';

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  taxable?: boolean;
  description?: string;
  requiresFlavorSelection?: boolean;
}

export type FlavorCategory = 'flavor' | 'blend';

export interface FlavorOption {
  id: string;
  name: string;
  available: boolean;
  category?: FlavorCategory;
  recipe?: string;
  nicotineFree?: boolean;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  category: MenuCategory;
  unitPrice: number;
  quantity: number;
  taxable?: boolean;
  flavors?: string[];
  bowlUpgrade?: string;
  iceHose?: boolean;
  notes?: string;
  addedBy?: string;
  prepStatus: PrepStatus;
  orderedAt: number;
  kitchenPrintedAt?: number;
}

export interface TableParty {
  id: string;
  partySize: number;
  guestName?: string;
  seatedAt: number;
  orders: OrderItem[];
}

export interface LoungeTable {
  id: string;
  name: string;
  tableNumber?: string;
  floor: TableFloor;
  zone: TableZone;
  seats: number;
  shape: TableShape;
  /** Position on 2D floor canvas as percentage (2 - 84) */
  x: number;
  y: number;
  width?: number;
  height?: number;
  status: TableStatus;
  rotation?: number;
  seatingTier?: SeatingTierId;
  timeLimitMinutes?: number;
  partySize?: number;
  guestName?: string;
  serverName?: string;
  seatedAt?: number;
  lastCoalCheckAt?: number;
  orders: OrderItem[];
  parties?: TableParty[];
  updatedAt: number;
}

export interface CompletedSession {
  id: string;
  tableName: string;
  floor: TableFloor;
  zone: TableZone;
  partySize: number;
  guestName?: string;
  serverName?: string;
  seatedAt: number;
  closedAt: number;
  durationMinutes: number;
  orders: OrderItem[];
  subtotal: number;
  discount?: number;
  tax: number;
  total: number;
  paymentMethod?: PaymentMethod;
  cashPaid?: number;
  cardPaid?: number;
  splitWays?: number;
}

export interface StaffProfile {
  clientId: string;
  name: string;
  role: StaffRole;
  alertMode: AlertMode;
}

export interface ActiveStaffMember {
  clientId: string;
  name: string;
  role: StaffRole;
  connectedAt: number;
}

export interface LoungeSettings {
  coalAlertMinutes: number;
  longStayAlertMinutes: number;
  salesTaxRate?: number;
  theme?: AppTheme;
  managerEmail?: string;
  syncServerIp?: string;
  kitchenPrinterMode?: PrinterMode;
  kitchenPrinterIp?: string;
  kitchenPrinterPort?: number;
  kitchenPrinterWidth?: PrinterPaperWidth;
  autoPrintKitchenTicket?: boolean;
  // Dedicated VIP Station Thermal Printer Settings
  enableVipPrinter?: boolean;
  vipPrinterMode?: PrinterMode;
  vipPrinterIp?: string;
  vipPrinterPort?: number;
  vipPrinterWidth?: PrinterPaperWidth;
  autoPrintVipTicket?: boolean;
}

export interface KitchenTicketItem {
  name: string;
  quantity: number;
  bowlSelection?: string;
  flavors?: string[];
  iceHose?: boolean;
  notes?: string;
}

export interface KitchenTicketPayload {
  tableId?: string;
  tableNumber: string;
  tableName: string;
  floor: TableFloor;
  zone: TableZone;
  serverName?: string;
  guestName?: string;
  paymentNotes?: string;
  printedAt: number;
  items: KitchenTicketItem[];
  isVipTicket?: boolean;
}

export interface BatchReport {
  id: string;
  closedAt: number;
  closedBy: string;
  totalTabs: number;
  autoClosedOpenTables: number;
  subtotal: number;
  tax: number;
  total: number;
  cashTotal?: number;
  cardTotal?: number;
  sessions: CompletedSession[];
}

export type ReservationStatus = 'scheduled' | 'seated' | 'cancelled' | 'noshow';

export interface LoungeReservation {
  id: string;
  guestName: string;
  phone?: string;
  partySize: number;
  reservationTime: number;
  floor?: TableFloor;
  preferredTier?: SeatingTierId;
  notes?: string;
  status: ReservationStatus;
  createdAt: number;
  createdBy?: string;
  assignedTableId?: string;
}

export interface LoungeStateSnapshot {
  tables: LoungeTable[];
  history: CompletedSession[];
  settings: LoungeSettings;
  activeStaff: ActiveStaffMember[];
  lastBatchReport?: BatchReport | null;
  flavors?: FlavorOption[];
  reservations?: LoungeReservation[];
}

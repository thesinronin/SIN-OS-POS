// server.ts
import "dotenv/config";
import express from "express";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import JSZip from "jszip";

// src/data/menu.ts
var VIP_UPGRADE_PRICE = 200;
var VIP_ONETIME_ALLDAY_UPGRADE_PRICE = 150;
var DEFAULT_SETTINGS = {
  coalAlertMinutes: 25,
  longStayAlertMinutes: 120,
  salesTaxRate: 0.0775,
  kitchenPrinterMode: "system",
  kitchenPrinterIp: "",
  kitchenPrinterPort: 9100,
  kitchenPrinterWidth: "80mm",
  autoPrintKitchenTicket: false
};
var SHISHA_FLAVORS = [
  "Double Apple",
  "Mint",
  "Blue Mist",
  "Love 66",
  "Lady Killer",
  "Grape Mint",
  "Watermelon",
  "Peach",
  "Pan Raas",
  "Lemon Mint",
  "Mango",
  "Gummy Bear"
];
var SHISHA_BLENDS = [
  { name: "Berry Frost", recipe: "Blue Mist + Mint" },
  { name: "Sweet Apple Chill", recipe: "Double Apple + Mint" },
  { name: "Tropical Sunset", recipe: "Mango + Peach + Watermelon" },
  { name: "Sin City Special", recipe: "Love 66 + Lady Killer + Mint" }
];
function createInitialBlends() {
  return SHISHA_BLENDS.map((blend, idx) => ({
    id: `bld-${idx + 1}`,
    name: blend.name,
    available: true,
    category: "blend",
    recipe: blend.recipe
  }));
}
function createInitialFlavors() {
  return [
    ...SHISHA_FLAVORS.map((name, idx) => ({
      id: `flv-${idx + 1}`,
      name,
      available: true,
      category: "flavor"
    })),
    ...createInitialBlends()
  ];
}
var SEATING_TIERS = {
  vip_allday: {
    id: "vip_allday",
    menuItemId: "h-vip-allday",
    label: "All Day VIP",
    shortLabel: "All Day VIP",
    basePrice: 250,
    includedPeople: 4,
    extraPersonPrice: 65,
    perPersonService: false,
    iceHosePrice: 15,
    refillPrice: 0,
    summary: "Up to 4 ppl \xB7 +$65/extra \xB7 Refills incl."
  },
  vip_onetime: {
    id: "vip_onetime",
    menuItemId: "h-vip-onetime",
    label: "One Time VIP",
    shortLabel: "One Time VIP (2h)",
    basePrice: 100,
    includedPeople: 4,
    extraPersonPrice: 20,
    perPersonService: false,
    iceHosePrice: 15,
    refillPrice: 20,
    timeLimitMinutes: 120,
    summary: "Up to 4 ppl \xB7 +$20/extra \xB7 2h limit"
  },
  bar_allday: {
    id: "bar_allday",
    menuItemId: "h-bar-allday",
    label: "Bar Top \xB7 All Day",
    shortLabel: "Bar All Day",
    basePrice: 100,
    includedPeople: 1,
    extraPersonPrice: 100,
    perPersonService: true,
    iceHosePrice: 15,
    refillPrice: 20,
    summary: "Single person service \xB7 $100/person"
  },
  bar_onetime: {
    id: "bar_onetime",
    menuItemId: "h-bar-onetime",
    label: "Bar Top \xB7 One Time",
    shortLabel: "Bar One Time",
    basePrice: 60,
    includedPeople: 1,
    extraPersonPrice: 60,
    perPersonService: true,
    iceHosePrice: 15,
    refillPrice: 20,
    summary: "Single person service \xB7 $60/person"
  },
  downstairs: {
    id: "downstairs",
    menuItemId: "h-downstairs",
    label: "Downstairs Hookah",
    shortLabel: "Downstairs",
    basePrice: 50,
    includedPeople: 4,
    extraPersonPrice: 15,
    perPersonService: false,
    iceHosePrice: 10,
    refillPrice: 15,
    summary: "Up to 4 ppl \xB7 +$15/extra \xB7 Ice $10"
  }
};
var SEATING_TIER_LIST = [
  SEATING_TIERS.vip_allday,
  SEATING_TIERS.vip_onetime,
  SEATING_TIERS.bar_allday,
  SEATING_TIERS.bar_onetime,
  SEATING_TIERS.downstairs
];
function getVipUpgradeOption(tierId) {
  if (tierId === "vip_onetime") {
    return {
      menuItemId: "r-upgrade-vip-allday",
      label: "All Day VIP Upgrade",
      shortLabel: "All Day VIP",
      price: VIP_ONETIME_ALLDAY_UPGRADE_PRICE,
      description: "Upgrade One Time VIP to All Day VIP ($150)"
    };
  }
  if (tierId === "downstairs" || tierId === "bar_onetime") {
    return {
      menuItemId: "r-upgrade-vip",
      label: "Upgrade to VIP",
      shortLabel: "Upgrade VIP",
      price: VIP_UPGRADE_PRICE,
      description: "Upgrade to All Day VIP ($200)"
    };
  }
  return null;
}
function getTableSeatingTier(table) {
  if (table.seatingTier && SEATING_TIERS[table.seatingTier]) {
    return SEATING_TIERS[table.seatingTier];
  }
  const orderIds = new Set(table.orders.map((o) => o.menuItemId));
  if (orderIds.has("r-upgrade-vip") || orderIds.has("r-upgrade-vip-allday")) {
    return SEATING_TIERS.vip_allday;
  }
  if (orderIds.has("h-vip-allday") || orderIds.has("h-allday")) {
    return SEATING_TIERS.vip_allday;
  }
  if (orderIds.has("h-vip-onetime")) {
    return SEATING_TIERS.vip_onetime;
  }
  if (orderIds.has("h-bar-allday")) {
    return SEATING_TIERS.bar_allday;
  }
  if (orderIds.has("h-bar-onetime")) {
    return SEATING_TIERS.bar_onetime;
  }
  if (orderIds.has("h-downstairs") || orderIds.has("h-onetime")) {
    return SEATING_TIERS.downstairs;
  }
  if (table.zone === "Bar") return SEATING_TIERS.bar_onetime;
  if (table.zone === "VIP") return SEATING_TIERS.vip_onetime;
  return SEATING_TIERS.downstairs;
}
function createInitialTables(now = Date.now()) {
  const min = 6e4;
  return [
    // Floor 1 (Main Lounge & Bar)
    {
      id: "f1-1",
      name: "L1",
      floor: "Floor 1",
      zone: "Lounge",
      seats: 4,
      shape: "square",
      x: 6,
      y: 10,
      status: "occupied",
      seatingTier: "downstairs",
      partySize: 3,
      guestName: "Karim",
      serverName: "Nadia",
      seatedAt: now - 19 * min,
      lastCoalCheckAt: now - 19 * min,
      orders: [
        {
          id: "ord-seed-1",
          menuItemId: "h-downstairs",
          name: "Downstairs Hookah",
          category: "hookah",
          unitPrice: 50,
          quantity: 1,
          flavors: ["Love 66", "Mint"],
          iceHose: false,
          addedBy: "Nadia",
          prepStatus: "served",
          orderedAt: now - 18 * min
        }
      ],
      updatedAt: now
    },
    { id: "f1-2", name: "L2", floor: "Floor 1", zone: "Lounge", seats: 4, shape: "square", x: 38, y: 10, status: "available", orders: [], updatedAt: now },
    { id: "f1-3", name: "Bar 1", floor: "Floor 1", zone: "Bar", seats: 2, shape: "round", x: 70, y: 10, status: "available", orders: [], updatedAt: now },
    { id: "f1-4", name: "L3", floor: "Floor 1", zone: "Lounge", seats: 6, shape: "round", x: 6, y: 46, status: "available", orders: [], updatedAt: now },
    {
      id: "f1-5",
      name: "VIP 1",
      floor: "Floor 1",
      zone: "VIP",
      seats: 8,
      shape: "booth",
      x: 38,
      y: 46,
      status: "occupied",
      seatingTier: "vip_allday",
      partySize: 6,
      guestName: "Maya Birthday",
      serverName: "Nadia",
      seatedAt: now - 34 * min,
      lastCoalCheckAt: now - 26 * min,
      orders: [
        {
          id: "ord-seed-3",
          menuItemId: "h-vip-allday",
          name: "All Day VIP",
          category: "hookah",
          unitPrice: 265,
          quantity: 1,
          flavors: ["Blue Mist", "Lady Killer", "Mint"],
          iceHose: true,
          notes: "Extra ice cubes",
          addedBy: "Nadia",
          prepStatus: "served",
          orderedAt: now - 33 * min
        },
        {
          id: "ord-seed-3-xtra",
          menuItemId: "r-xtra-vip-allday",
          name: "Xtra Person \xB7 All Day VIP",
          category: "refill",
          unitPrice: 65,
          quantity: 2,
          notes: "Party of 6 (2 over 4)",
          addedBy: "Nadia",
          prepStatus: "served",
          orderedAt: now - 33 * min
        }
      ],
      updatedAt: now
    },
    // Floor 2 (Upstairs / Mezzanine VIP)
    { id: "f2-1", name: "2F-1", floor: "Floor 2", zone: "Lounge", seats: 4, shape: "square", x: 8, y: 12, status: "available", orders: [], updatedAt: now },
    { id: "f2-2", name: "2F-2", floor: "Floor 2", zone: "Lounge", seats: 4, shape: "square", x: 54, y: 12, status: "available", orders: [], updatedAt: now },
    {
      id: "f2-3",
      name: "2F-VIP 1",
      floor: "Floor 2",
      zone: "VIP",
      seats: 8,
      shape: "booth",
      x: 8,
      y: 48,
      status: "occupied",
      seatingTier: "vip_onetime",
      timeLimitMinutes: 120,
      partySize: 5,
      guestName: "Tariq",
      serverName: "Sam",
      seatedAt: now - 11 * min,
      lastCoalCheckAt: now - 11 * min,
      orders: [
        {
          id: "ord-seed-5",
          menuItemId: "h-vip-onetime",
          name: "One Time VIP (2h)",
          category: "hookah",
          unitPrice: 100,
          quantity: 1,
          flavors: ["Double Apple", "Mint"],
          iceHose: false,
          addedBy: "Sam",
          prepStatus: "prepping",
          orderedAt: now - 4 * min
        },
        {
          id: "ord-seed-5-xtra",
          menuItemId: "r-xtra-vip-onetime",
          name: "Xtra Person \xB7 One Time VIP",
          category: "refill",
          unitPrice: 20,
          quantity: 1,
          notes: "Party of 5 (1 over 4)",
          addedBy: "Sam",
          prepStatus: "served",
          orderedAt: now - 11 * min
        }
      ],
      updatedAt: now
    },
    { id: "f2-4", name: "2F-VIP 2", floor: "Floor 2", zone: "VIP", seats: 10, shape: "booth", x: 54, y: 48, status: "available", orders: [], updatedAt: now },
    // Outside Seating (Patio & Cabanas)
    {
      id: "out-1",
      name: "Patio 1",
      floor: "Outside",
      zone: "Patio",
      seats: 4,
      shape: "round",
      x: 8,
      y: 12,
      status: "occupied",
      seatingTier: "downstairs",
      partySize: 2,
      guestName: "Elena",
      serverName: "Sam",
      seatedAt: now - 46 * min,
      lastCoalCheckAt: now - 12 * min,
      orders: [
        {
          id: "ord-seed-6",
          menuItemId: "h-downstairs",
          name: "Downstairs Hookah",
          category: "hookah",
          unitPrice: 50,
          quantity: 1,
          flavors: ["Watermelon", "Mint"],
          iceHose: false,
          addedBy: "Sam",
          prepStatus: "served",
          orderedAt: now - 45 * min
        }
      ],
      updatedAt: now
    },
    { id: "out-2", name: "Patio 2", floor: "Outside", zone: "Patio", seats: 4, shape: "round", x: 54, y: 12, status: "available", orders: [], updatedAt: now },
    { id: "out-3", name: "Patio 3", floor: "Outside", zone: "Patio", seats: 6, shape: "square", x: 8, y: 48, status: "available", orders: [], updatedAt: now },
    { id: "out-4", name: "Cabana 1", floor: "Outside", zone: "VIP", seats: 8, shape: "booth", x: 54, y: 48, status: "available", orders: [], updatedAt: now }
  ];
}

// src/services/kitchenPrinter.ts
var ESC = 27;
var GS = 29;
var LF = 10;
function encodeAscii(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes.push(code >= 32 && code <= 126 ? code : 63);
  }
  return bytes;
}
function line(str) {
  return [...encodeAscii(str), LF];
}
function buildEscPosBuffer(ticket, paperWidth = "80mm") {
  const cols = paperWidth === "58mm" ? 32 : 42;
  const divider = "-".repeat(cols);
  const boldDivider = "=".repeat(cols);
  const timeStr = new Date(ticket.printedAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
  const isVip = ticket.isVipTicket || ticket.zone === "VIP" || (ticket.tableName || "").toLowerCase().includes("vip");
  const chunks = [
    // Initialize printer
    ESC,
    64,
    // Center align header
    ESC,
    97,
    1,
    // Emphasized on
    ESC,
    69,
    1,
    ...line(isVip ? "*** VIP STATION PREP ***" : "SIN-OS KITCHEN"),
    // Double width + double height for Table #
    GS,
    33,
    17,
    ...line(`TABLE #${ticket.tableNumber || ticket.tableName}`),
    // Normal size
    GS,
    33,
    0,
    ESC,
    69,
    0,
    ...line(`${ticket.floor} / ${ticket.zone} (${ticket.tableName})`),
    ...line(boldDivider),
    // Left align body
    ESC,
    97,
    0,
    ...line(`Time: ${timeStr}   Server: ${ticket.serverName || "Staff"}`)
  ];
  if (ticket.guestName) {
    chunks.push(...line(`Guest: ${ticket.guestName}`));
  }
  chunks.push(...line(divider));
  for (const item of ticket.items) {
    chunks.push(ESC, 69, 1);
    chunks.push(...line(`${item.quantity}x ${item.name}`));
    chunks.push(ESC, 69, 0);
    if (item.flavors && item.flavors.length > 0) {
      chunks.push(ESC, 69, 1, GS, 33, 1);
      chunks.push(...line(`MIX: ${item.flavors.join(" + ")}`));
      chunks.push(GS, 33, 0, ESC, 69, 0);
    }
    if (item.iceHose) {
      chunks.push(ESC, 69, 1);
      chunks.push(...line("+ ICE HOSE"));
      chunks.push(ESC, 69, 0);
    }
    if (item.notes) {
      chunks.push(...line(`NOTE: ${item.notes}`));
    }
    chunks.push(...line(divider));
  }
  chunks.push(
    ESC,
    97,
    1,
    ...line("PREP IMMEDIATELY"),
    LF,
    LF,
    LF,
    LF,
    // Partial cut
    GS,
    86,
    66,
    0
  );
  return new Uint8Array(chunks);
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var STATE_FILE = path.join(__dirname, ".lounge-state.json");
function loadPersistedState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.tables) && parsed.tables.length > 0) {
        const rawSettings = parsed.settings ?? {};
        const { managerPin: _removedPin, ...cleanSettings } = rawSettings;
        const rawFlavors = Array.isArray(parsed.flavors) && parsed.flavors.length > 0 ? parsed.flavors : createInitialFlavors();
        const hasCategoryTags = rawFlavors.some(
          (f) => f.category === "flavor" || f.category === "blend"
        );
        const migratedFlavors = hasCategoryTags ? rawFlavors : [
          ...rawFlavors.map((f) => ({ ...f, category: "flavor" })),
          ...createInitialBlends()
        ];
        return {
          tables: parsed.tables,
          history: Array.isArray(parsed.history) ? parsed.history : [],
          settings: { ...DEFAULT_SETTINGS, ...cleanSettings },
          lastBatchReport: parsed.lastBatchReport ?? null,
          flavors: migratedFlavors,
          reservations: Array.isArray(parsed.reservations) ? parsed.reservations : []
        };
      }
    }
  } catch (err) {
    console.warn("Could not read persisted lounge state, initializing fresh:", err);
  }
  return {
    tables: createInitialTables(),
    history: [],
    settings: { ...DEFAULT_SETTINGS },
    lastBatchReport: null,
    flavors: createInitialFlavors(),
    reservations: []
  };
}
var state = loadPersistedState();
var connectedStaff = /* @__PURE__ */ new Map();
var saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to persist lounge state:", err);
    }
  }, 150);
}
function getSnapshot() {
  return {
    tables: state.tables,
    history: state.history,
    settings: state.settings,
    activeStaff: Array.from(connectedStaff.values()),
    lastBatchReport: state.lastBatchReport,
    flavors: state.flavors,
    reservations: state.reservations
  };
}
function broadcast(wss, payload) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}
function broadcastPresence(wss) {
  broadcast(wss, {
    type: "staff:presence",
    activeStaff: Array.from(connectedStaff.values())
  });
}
function getLocalWifiIps() {
  const ips = [];
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (!iface.internal && iface.family === "IPv4") {
          ips.push(iface.address);
        }
      }
    }
  } catch {
  }
  return ips;
}
async function startServer() {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
  });
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, connectedStaff: connectedStaff.size });
  });
  app.get("/api/info", (req, res) => {
    const host = req.get("host") || "";
    const wifiIps = getLocalWifiIps();
    res.json({
      ok: true,
      wifiIps,
      primaryIp: wifiIps[0] || "localhost",
      host,
      connectedStaff: connectedStaff.size
    });
  });
  app.get("/api/state", (_req, res) => {
    res.json(getSnapshot());
  });
  app.post("/api/template/save", (req, res) => {
    const body = req.body;
    if (Array.isArray(body?.tables) && body.tables.length > 0) {
      state.tables = body.tables;
      if (Array.isArray(body.flavors) && body.flavors.length > 0) {
        state.flavors = body.flavors;
      }
      scheduleSave();
      broadcast(wss, { type: "state:init", snapshot: getSnapshot() });
    }
    res.json({ ok: true });
  });
  const distPath = path.join(__dirname, "dist");
  function getDistVersion() {
    try {
      if (fs.existsSync(distPath)) {
        const stats = fs.statSync(distPath);
        const mtime = Math.floor(stats.mtimeMs);
        return { version: `2.0.${mtime}`, mtime };
      }
    } catch {
    }
    return { version: "2.0.0", mtime: Date.now() };
  }
  app.get("/api/ota/check", (req, res) => {
    const info = getDistVersion();
    const host = req.get("host") || "localhost:3000";
    const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
    const zipUrl = `${protocol}://${host}/api/ota/bundle/latest.zip`;
    res.json({
      version: info.version,
      url: zipUrl,
      releasedAt: info.mtime
    });
  });
  app.get("/api/ota/bundle/latest.zip", async (_req, res) => {
    try {
      let addFilesToZip = function(dir, zipFolder) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            addFilesToZip(fullPath, zipFolder.folder(file));
          } else {
            zipFolder.file(file, fs.readFileSync(fullPath));
          }
        }
      };
      if (!fs.existsSync(distPath)) {
        res.status(404).send("Web bundle dist folder not found.");
        return;
      }
      const zip = new JSZip();
      addFilesToZip(distPath, zip);
      const content = await zip.generateAsync({ type: "nodebuffer" });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="latest.zip"');
      res.send(content);
    } catch (err) {
      console.error("Failed to generate OTA zip:", err);
      res.status(500).send("Failed to generate OTA bundle zip");
    }
  });
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  function executeBatchOut(staffName) {
    const now = Date.now();
    const autoClosedSessions = [];
    for (const table of state.tables) {
      if (table.status !== "occupied") continue;
      const seatedAt = table.seatedAt || now;
      const sub = table.orders.reduce(
        (s, o) => s + o.unitPrice * o.quantity,
        0
      );
      const tax2 = 0;
      autoClosedSessions.push({
        id: `sess-${now}-${table.id}`,
        tableName: table.name,
        floor: table.floor,
        zone: table.zone,
        partySize: table.partySize || 1,
        guestName: table.guestName,
        serverName: table.serverName || staffName,
        seatedAt,
        closedAt: now,
        durationMinutes: Math.max(
          1,
          Math.round((now - seatedAt) / 6e4)
        ),
        orders: table.orders,
        subtotal: sub,
        tax: tax2,
        total: sub,
        paymentMethod: "card",
        cashPaid: 0,
        cardPaid: sub
      });
      table.status = "available";
      table.seatingTier = void 0;
      table.timeLimitMinutes = void 0;
      table.partySize = void 0;
      table.guestName = void 0;
      table.serverName = void 0;
      table.seatedAt = void 0;
      table.lastCoalCheckAt = void 0;
      table.orders = [];
      table.updatedAt = now;
    }
    const allDaySessions = [...autoClosedSessions, ...state.history];
    const subtotal = allDaySessions.reduce((s, x) => s + x.subtotal, 0);
    const tax = allDaySessions.reduce((s, x) => s + x.tax, 0);
    const total = allDaySessions.reduce((s, x) => s + x.total, 0);
    const cashTotal = allDaySessions.reduce(
      (s, x) => s + (x.cashPaid ?? (x.paymentMethod === "cash" ? x.total : 0)),
      0
    );
    const cardTotal = allDaySessions.reduce(
      (s, x) => s + (x.cardPaid ?? (x.paymentMethod === "cash" ? 0 : x.total - (x.cashPaid ?? 0))),
      0
    );
    const report = {
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
      sessions: allDaySessions
    };
    state.lastBatchReport = report;
    state.history = [];
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to persist batch out state:", err);
      scheduleSave();
    }
    broadcast(wss, { type: "state:init", snapshot: getSnapshot() });
    return report;
  }
  app.post("/api/shift/batch-out", (req, res) => {
    const rawName = req.body?.staffName;
    const staffName = String(rawName || "Manager").trim() || "Manager";
    const report = executeBatchOut(staffName);
    res.json({ ok: true, report, snapshot: getSnapshot() });
  });
  app.post("/api/print/kitchen-ticket", (req, res) => {
    const body = req.body || {};
    const printerIp = String(body.printerIp || "").trim();
    const printerPort = Math.max(1, Math.min(65535, Number(body.printerPort) || 9100));
    const paperWidth = body.paperWidth === "58mm" ? "58mm" : "80mm";
    const ticket = body.ticket;
    if (!printerIp) {
      res.status(400).json({ ok: false, error: "Missing printer IP address." });
      return;
    }
    if (!ticket || !Array.isArray(ticket.items) || ticket.items.length === 0) {
      res.status(400).json({ ok: false, error: "Kitchen ticket has no items to print." });
      return;
    }
    const escPosBytes = Buffer.from(buildEscPosBuffer(ticket, paperWidth));
    const socket = net.createConnection({ host: printerIp, port: printerPort });
    let responded = false;
    socket.setTimeout(3500);
    socket.on("connect", () => {
      socket.write(escPosBytes, () => {
        socket.end();
        if (!responded) {
          responded = true;
          res.json({ ok: true, bytesSent: escPosBytes.length });
        }
      });
    });
    socket.on("timeout", () => {
      socket.destroy();
      if (!responded) {
        responded = true;
        res.status(502).json({
          ok: false,
          error: `Timed out connecting to thermal printer at ${printerIp}:${printerPort}. Check printer power/Wi-Fi or use Android/System Print.`
        });
      }
    });
    socket.on("error", (err) => {
      socket.destroy();
      if (!responded) {
        responded = true;
        res.status(502).json({
          ok: false,
          error: `Could not reach thermal printer at ${printerIp}:${printerPort} (${err.message}).`
        });
      }
    });
  });
  if (process.env.NODE_ENV === "production") {
    const distDir = path.join(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR === "true" ? false : { server, path: "/__vite_hmr" },
        ws: { server, path: "/__vite_hmr" }
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    if (pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "state:init", snapshot: getSnapshot() }));
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const now = Date.now();
        switch (msg.type) {
          case "staff:join": {
            const clientId = String(msg.clientId || "");
            const name = String(msg.name || "Staff").trim() || "Staff";
            const role = msg.role || "Server";
            if (clientId) {
              connectedStaff.set(ws, {
                clientId,
                name,
                role,
                connectedAt: now
              });
              broadcastPresence(wss);
            }
            break;
          }
          case "table:seat": {
            const tableId = String(msg.tableId || "");
            const partySize = Math.max(1, Number(msg.partySize) || 2);
            const guestName = String(msg.guestName || "").trim() || void 0;
            const tableNumber = String(msg.tableNumber || "").trim() || void 0;
            const serverName = String(msg.serverName || "Staff").trim();
            const initialOrders = Array.isArray(msg.initialOrders) ? msg.initialOrders.map((o) => ({
              ...o,
              addedBy: o.addedBy || serverName
            })) : [];
            const table = state.tables.find((t) => t.id === tableId);
            if (!table) break;
            table.status = "occupied";
            if (tableNumber !== void 0) {
              table.tableNumber = tableNumber;
            }
            table.seatingTier = msg.seatingTier || void 0;
            table.timeLimitMinutes = typeof msg.timeLimitMinutes === "number" && msg.timeLimitMinutes > 0 ? msg.timeLimitMinutes : void 0;
            table.partySize = partySize;
            table.guestName = guestName;
            table.serverName = serverName;
            table.seatedAt = now;
            table.lastCoalCheckAt = now;
            table.orders = initialOrders;
            table.updatedAt = now;
            scheduleSave();
            broadcast(wss, { type: "table:updated", table });
            break;
          }
          case "table:updateNumber": {
            const tableId = String(msg.tableId || "");
            const tableNumber = String(msg.tableNumber || "").trim() || void 0;
            const table = state.tables.find((t) => t.id === tableId);
            if (!table) break;
            table.tableNumber = tableNumber;
            table.updatedAt = now;
            scheduleSave();
            broadcast(wss, { type: "table:updated", table });
            break;
          }
          case "table:updatePartySize": {
            const tableId = String(msg.tableId || "");
            const partySize = Math.max(
              1,
              Math.min(50, Math.round(Number(msg.partySize) || 1))
            );
            const table = state.tables.find((t) => t.id === tableId);
            if (!table || table.status !== "occupied") break;
            table.partySize = partySize;
            table.updatedAt = now;
            scheduleSave();
            broadcast(wss, { type: "table:updated", table });
            break;
          }
          case "table:addOrder": {
            const tableId = String(msg.tableId || "");
            const item = msg.item;
            if (!item || !item.id) break;
            const table = state.tables.find((t) => t.id === tableId);
            if (!table) break;
            if (table.orders.some((o) => o.id === item.id)) break;
            table.orders.push(item);
            if (item.category === "hookah" || item.category === "refill") {
              table.lastCoalCheckAt = now;
            }
            table.updatedAt = now;
            scheduleSave();
            broadcast(wss, { type: "table:updated", table });
            break;
          }
          case "table:updateQty": {
            const tableId = String(msg.tableId || "");
            const orderId = String(msg.orderId || "");
            const delta = Number(msg.delta) || 0;
            const table = state.tables.find((t) => t.id === tableId);
            if (!table) break;
            table.orders = table.orders.map(
              (o) => o.id === orderId ? { ...o, quantity: o.quantity + delta } : o
            ).filter((o) => o.quantity > 0);
            table.updatedAt = now;
            scheduleSave();
            broadcast(wss, { type: "table:updated", table });
            break;
          }
          case "table:updateOrderPrice": {
            const tableId = String(msg.tableId || "");
            const orderId = String(msg.orderId || "");
            const unitPrice = Math.max(0, Number(msg.unitPrice) || 0);
            const table = state.tables.find((t) => t.id === tableId);
            if (!table) break;
            table.orders = table.orders.map(
              (o) => o.id === orderId ? { ...o, unitPrice } : o
            );
            table.updatedAt = now;
            scheduleSave();
            broadcast(wss, { type: "table:updated", table });
            break;
          }
          case "table:refreshCoals": {
            const tableId = String(msg.tableId || "");
            const table = state.tables.find((t) => t.id === tableId);
            if (!table) break;
            table.lastCoalCheckAt = now;
            table.updatedAt = now;
            scheduleSave();
            broadcast(wss, { type: "table:updated", table });
            break;
          }
          case "table:advancePrep": {
            const tableId = String(msg.tableId || "");
            const orderId = String(msg.orderId || "");
            const nextStatus = msg.nextStatus;
            const table = state.tables.find((t) => t.id === tableId);
            if (!table) break;
            table.orders = table.orders.map(
              (o) => o.id === orderId ? { ...o, prepStatus: nextStatus } : o
            );
            table.updatedAt = now;
            scheduleSave();
            broadcast(wss, { type: "table:updated", table });
            break;
          }
          case "table:upgradeVip": {
            const tableId = String(msg.tableId || "");
            const item = msg.item;
            const table = state.tables.find((t) => t.id === tableId);
            if (!table || table.status !== "occupied") break;
            const currentTier = getTableSeatingTier(table);
            const upgradeOpt = getVipUpgradeOption(currentTier.id);
            if (!upgradeOpt) break;
            const upgradeItem = {
              id: item?.id || `ord-${now}-${Math.random().toString(36).slice(2, 7)}-vip`,
              menuItemId: upgradeOpt.menuItemId,
              name: upgradeOpt.label,
              category: "refill",
              unitPrice: upgradeOpt.price,
              quantity: 1,
              notes: item?.notes || `Upgraded ${currentTier.shortLabel} to All Day VIP`,
              addedBy: item?.addedBy || "Staff",
              prepStatus: "served",
              orderedAt: item?.orderedAt || now
            };
            if (!table.orders.some((o) => o.id === upgradeItem.id)) {
              table.orders.push(upgradeItem);
            }
            table.seatingTier = "vip_allday";
            table.timeLimitMinutes = void 0;
            table.updatedAt = now;
            scheduleSave();
            broadcast(wss, { type: "table:updated", table });
            break;
          }
          case "table:updateOrderFlavors": {
            const tableId = String(msg.tableId || "");
            const orderId = String(msg.orderId || "");
            const nextFlavors = Array.isArray(msg.flavors) ? msg.flavors.map((f) => String(f || "").trim()).filter(Boolean).slice(0, 3) : [];
            const table = state.tables.find((t) => t.id === tableId);
            if (!table) break;
            table.orders = table.orders.map(
              (o) => o.id === orderId ? {
                ...o,
                flavors: nextFlavors.length > 0 ? nextFlavors : void 0
              } : o
            );
            table.updatedAt = now;
            scheduleSave();
            broadcast(wss, { type: "table:updated", table });
            break;
          }
          case "table:markPrinted": {
            const tableId = String(msg.tableId || "");
            const orderIds = Array.isArray(msg.orderIds) ? new Set(msg.orderIds.map((id) => String(id || ""))) : null;
            const table = state.tables.find((t) => t.id === tableId);
            if (!table) break;
            table.orders = table.orders.map(
              (o) => !orderIds || orderIds.size === 0 || orderIds.has(o.id) ? { ...o, kitchenPrintedAt: now } : o
            );
            table.updatedAt = now;
            scheduleSave();
            broadcast(wss, { type: "table:updated", table });
            break;
          }
          case "table:seatAnotherParty": {
            const tableId = String(msg.tableId || "");
            const partySize = Math.max(1, Number(msg.partySize) || 2);
            const guestName = String(msg.guestName || "").trim() || void 0;
            const initialOrders = Array.isArray(msg.initialOrders) ? msg.initialOrders : [];
            const table = state.tables.find((t) => t.id === tableId);
            if (!table) break;
            const existingParties = table.parties || [
              {
                id: `party-primary-${table.seatedAt || now}`,
                partySize: table.partySize || 1,
                guestName: table.guestName,
                seatedAt: table.seatedAt || now,
                orders: [...table.orders]
              }
            ];
            const newParty = {
              id: `party-${now}-${Math.random().toString(36).slice(2, 6)}`,
              partySize,
              guestName,
              seatedAt: now,
              orders: initialOrders
            };
            const nextParties = [...existingParties, newParty];
            const combinedPartySize = nextParties.reduce((sum, p) => sum + p.partySize, 0);
            const combinedGuestNames = nextParties.map((p) => p.guestName).filter(Boolean).join(", ");
            table.status = "occupied";
            table.partySize = combinedPartySize;
            table.guestName = combinedGuestNames || void 0;
            table.orders = [...table.orders, ...initialOrders];
            table.parties = nextParties;
            table.updatedAt = now;
            scheduleSave();
            broadcast(wss, { type: "table:updated", table });
            break;
          }
          case "table:checkoutParty": {
            const tableId = String(msg.tableId || "");
            const partyId = String(msg.partyId || "");
            const table = state.tables.find((t) => t.id === tableId);
            if (!table || !table.parties || table.parties.length === 0) break;
            const partyToCheckout = table.parties.find((p) => p.id === partyId);
            if (!partyToCheckout) break;
            const remainingParties = table.parties.filter((p) => p.id !== partyId);
            const subtotal = partyToCheckout.orders.reduce(
              (s, o) => s + o.unitPrice * o.quantity,
              0
            );
            const localSess = {
              id: `sess-${now}-${partyToCheckout.id}`,
              tableName: table.tableNumber ? `#${table.tableNumber} \xB7 ${table.name} (${partyToCheckout.guestName || "Party Tab"})` : `${table.name} (${partyToCheckout.guestName || "Party Tab"})`,
              floor: table.floor,
              zone: table.zone,
              partySize: partyToCheckout.partySize || 1,
              guestName: partyToCheckout.guestName,
              serverName: table.serverName || "Staff",
              seatedAt: partyToCheckout.seatedAt || table.seatedAt || now,
              closedAt: now,
              durationMinutes: Math.max(
                1,
                Math.round((now - (partyToCheckout.seatedAt || table.seatedAt || now)) / 6e4)
              ),
              orders: partyToCheckout.orders,
              subtotal,
              tax: 0,
              total: subtotal,
              paymentMethod: msg.paymentMethod || "card",
              cashPaid: Number(msg.cashPaid) || 0,
              cardPaid: msg.paymentMethod === "cash" ? 0 : subtotal,
              splitWays: typeof msg.splitWays === "number" ? msg.splitWays : void 0
            };
            state.history.unshift(localSess);
            broadcast(wss, { type: "session:completed", session: localSess });
            if (remainingParties.length === 0) {
              table.status = "available";
              table.tableNumber = void 0;
              table.seatingTier = void 0;
              table.timeLimitMinutes = void 0;
              table.partySize = void 0;
              table.guestName = void 0;
              table.serverName = void 0;
              table.seatedAt = void 0;
              table.lastCoalCheckAt = void 0;
              table.orders = [];
              table.parties = void 0;
              table.updatedAt = now;
            } else {
              const checkedOutOrderIds = new Set(partyToCheckout.orders.map((o) => o.id));
              table.orders = table.orders.filter((o) => !checkedOutOrderIds.has(o.id));
              table.partySize = remainingParties.reduce((sum, p) => sum + p.partySize, 0);
              table.guestName = remainingParties.map((p) => p.guestName).filter(Boolean).join(", ");
              table.parties = remainingParties;
              table.updatedAt = now;
            }
            scheduleSave();
            broadcast(wss, { type: "table:updated", table });
            break;
          }
          case "table:transfer": {
            const fromTableId = String(msg.fromTableId || "");
            const toTableId = String(msg.toTableId || "");
            const upgradeToVipFlag = Boolean(msg.upgradeToVip);
            const staffName = String(msg.staffName || "Staff").trim() || "Staff";
            const fromTable = state.tables.find((t) => t.id === fromTableId);
            const toTable = state.tables.find((t) => t.id === toTableId);
            if (!fromTable || !toTable || fromTable.id === toTable.id || fromTable.status !== "occupied" || toTable.status !== "available") {
              break;
            }
            const movedOrders = [...fromTable.orders];
            const currentTier = getTableSeatingTier(fromTable);
            const upgradeOpt = getVipUpgradeOption(currentTier.id);
            let nextTier = fromTable.seatingTier;
            let nextLimit = fromTable.timeLimitMinutes;
            if (upgradeToVipFlag && upgradeOpt) {
              movedOrders.push({
                id: `ord-${now}-${Math.random().toString(36).slice(2, 7)}-vip`,
                menuItemId: upgradeOpt.menuItemId,
                name: upgradeOpt.label,
                category: "refill",
                unitPrice: upgradeOpt.price,
                quantity: 1,
                notes: `Transferred & upgraded from ${fromTable.name}`,
                addedBy: staffName,
                prepStatus: "served",
                orderedAt: now
              });
              nextTier = "vip_allday";
              nextLimit = void 0;
            }
            toTable.status = "occupied";
            toTable.seatingTier = nextTier;
            toTable.timeLimitMinutes = nextLimit;
            toTable.partySize = fromTable.partySize;
            toTable.guestName = fromTable.guestName;
            toTable.serverName = fromTable.serverName || staffName;
            toTable.seatedAt = fromTable.seatedAt || now;
            toTable.lastCoalCheckAt = fromTable.lastCoalCheckAt || now;
            toTable.orders = movedOrders;
            toTable.updatedAt = now;
            fromTable.status = "available";
            fromTable.tableNumber = void 0;
            fromTable.seatingTier = void 0;
            fromTable.timeLimitMinutes = void 0;
            fromTable.partySize = void 0;
            fromTable.guestName = void 0;
            fromTable.serverName = void 0;
            fromTable.seatedAt = void 0;
            fromTable.lastCoalCheckAt = void 0;
            fromTable.orders = [];
            fromTable.parties = void 0;
            fromTable.updatedAt = now;
            scheduleSave();
            broadcast(wss, { type: "table:updated", table: fromTable });
            broadcast(wss, { type: "table:updated", table: toTable });
            break;
          }
          case "table:checkout": {
            const tableId = String(msg.tableId || "");
            const staffName = String(msg.staffName || "Staff");
            const table = state.tables.find((t) => t.id === tableId);
            if (!table || !table.seatedAt) break;
            const subtotal = table.orders.reduce(
              (s, o) => s + o.unitPrice * o.quantity,
              0
            );
            const tax = 0;
            const rawMethod = String(msg.paymentMethod || "card");
            const paymentMethod = rawMethod === "cash" || rawMethod === "split" ? rawMethod : "card";
            const cashPaid = paymentMethod === "cash" ? subtotal : paymentMethod === "split" ? Math.max(0, Math.min(subtotal, Number(msg.cashPaid) || 0)) : 0;
            const cardPaid = paymentMethod === "card" ? subtotal : Math.max(0, Number((subtotal - cashPaid).toFixed(2)));
            const splitWays = typeof msg.splitWays === "number" && msg.splitWays > 1 ? Math.min(20, Math.round(msg.splitWays)) : void 0;
            const session = {
              id: `sess-${now}-${table.id}`,
              tableName: table.tableNumber ? `#${table.tableNumber} \xB7 ${table.name}` : table.name,
              floor: table.floor,
              zone: table.zone,
              partySize: table.partySize || 1,
              guestName: table.guestName,
              serverName: table.serverName || staffName,
              seatedAt: table.seatedAt,
              closedAt: now,
              durationMinutes: Math.max(
                1,
                Math.round((now - table.seatedAt) / 6e4)
              ),
              orders: table.orders,
              subtotal,
              tax,
              total: subtotal,
              paymentMethod,
              cashPaid,
              cardPaid,
              splitWays
            };
            state.history.unshift(session);
            if (state.history.length > 200) {
              state.history = state.history.slice(0, 200);
            }
            table.status = "available";
            table.seatingTier = void 0;
            table.timeLimitMinutes = void 0;
            table.partySize = void 0;
            table.guestName = void 0;
            table.serverName = void 0;
            table.seatedAt = void 0;
            table.lastCoalCheckAt = void 0;
            table.orders = [];
            table.updatedAt = now;
            scheduleSave();
            broadcast(wss, { type: "table:updated", table });
            broadcast(wss, { type: "session:completed", session });
            break;
          }
          case "layout:moveTable": {
            const tableId = String(msg.tableId || "");
            const x = Math.max(2, Math.min(84, Number(msg.x) || 0));
            const y = Math.max(2, Math.min(84, Number(msg.y) || 0));
            const table = state.tables.find((t) => t.id === tableId);
            if (!table) break;
            table.x = x;
            table.y = y;
            table.updatedAt = now;
            scheduleSave();
            broadcast(wss, { type: "table:updated", table });
            break;
          }
          case "layout:saveTable": {
            const payload = msg.data;
            if (!payload) break;
            const cleanTableNum = String(payload.tableNumber || "").trim() || void 0;
            const cleanName = String(payload.name || "").trim() || (cleanTableNum ? `Table ${cleanTableNum}` : "");
            if (!cleanName) break;
            if (payload.id) {
              const table = state.tables.find((t) => t.id === payload.id);
              if (!table) break;
              table.name = cleanName;
              table.tableNumber = cleanTableNum;
              table.floor = payload.floor;
              table.zone = payload.zone;
              table.seats = Math.max(1, Number(payload.seats) || 4);
              table.shape = payload.shape;
              table.rotation = payload.rotation;
              table.width = payload.width;
              table.height = payload.height;
              table.updatedAt = now;
              scheduleSave();
              broadcast(wss, { type: "table:updated", table });
            } else {
              const requestedId = String(payload.newId || "").trim();
              const newId = requestedId && !state.tables.some((t) => t.id === requestedId) ? requestedId : `t-${now}-${Math.random().toString(36).slice(2, 6)}`;
              const floorTables = state.tables.filter(
                (t) => t.floor === payload.floor
              );
              const idx = floorTables.length;
              const col = idx % 3;
              const row = Math.floor(idx / 3) % 4;
              const newTable = {
                id: newId,
                name: cleanName,
                tableNumber: cleanTableNum,
                floor: payload.floor,
                zone: payload.zone,
                seats: Math.max(1, Number(payload.seats) || 4),
                shape: payload.shape,
                rotation: payload.rotation,
                width: payload.width,
                height: payload.height,
                x: Math.min(72, 6 + col * 30),
                y: Math.min(72, 10 + row * 26),
                status: "available",
                orders: [],
                updatedAt: now
              };
              state.tables.push(newTable);
              scheduleSave();
              broadcast(wss, { type: "table:updated", table: newTable });
            }
            break;
          }
          case "layout:deleteTable": {
            const tableId = String(msg.tableId || "");
            const existing = state.tables.find((t) => t.id === tableId);
            if (!existing || existing.status === "occupied") break;
            state.tables = state.tables.filter((t) => t.id !== tableId);
            scheduleSave();
            broadcast(wss, { type: "table:deleted", tableId });
            break;
          }
          case "settings:update": {
            const nextSettings = msg.settings;
            if (!nextSettings) break;
            const modeVal = nextSettings.kitchenPrinterMode === "network" || nextSettings.kitchenPrinterMode === "bluetooth" ? nextSettings.kitchenPrinterMode : "system";
            const widthVal = nextSettings.kitchenPrinterWidth === "58mm" ? "58mm" : "80mm";
            state.settings = {
              coalAlertMinutes: Math.max(
                5,
                Math.min(120, Number(nextSettings.coalAlertMinutes) || 25)
              ),
              longStayAlertMinutes: Math.max(
                15,
                Math.min(360, Number(nextSettings.longStayAlertMinutes) || 120)
              ),
              kitchenPrinterMode: modeVal,
              kitchenPrinterIp: String(nextSettings.kitchenPrinterIp || "").trim(),
              kitchenPrinterPort: Math.max(
                1,
                Math.min(65535, Number(nextSettings.kitchenPrinterPort) || 9100)
              ),
              kitchenPrinterWidth: widthVal,
              autoPrintKitchenTicket: Boolean(nextSettings.autoPrintKitchenTicket)
            };
            scheduleSave();
            broadcast(wss, { type: "settings:updated", settings: state.settings });
            break;
          }
          case "flavors:add": {
            const rawName = String(msg.name || "").trim();
            if (!rawName) break;
            const category = msg.category === "blend" ? "blend" : "flavor";
            const recipe = String(msg.recipe || "").trim() || void 0;
            const nicotineFree = Boolean(msg.nicotineFree);
            const existing = state.flavors.find(
              (f) => f.name.toLowerCase() === rawName.toLowerCase()
            );
            if (existing) {
              existing.available = true;
              existing.category = category;
              if (recipe !== void 0) existing.recipe = recipe;
              existing.nicotineFree = nicotineFree;
            } else {
              state.flavors.push({
                id: `${category === "blend" ? "bld" : "flv"}-${now}-${Math.random().toString(36).slice(2, 6)}`,
                name: rawName,
                available: true,
                category,
                recipe,
                nicotineFree
              });
            }
            scheduleSave();
            broadcast(wss, { type: "flavors:updated", flavors: state.flavors });
            break;
          }
          case "flavors:toggle": {
            const flavorId = String(msg.flavorId || "");
            const target = state.flavors.find((f) => f.id === flavorId);
            if (!target) break;
            target.available = !target.available;
            scheduleSave();
            broadcast(wss, { type: "flavors:updated", flavors: state.flavors });
            break;
          }
          case "flavors:remove": {
            const flavorId = String(msg.flavorId || "");
            state.flavors = state.flavors.filter((f) => f.id !== flavorId);
            scheduleSave();
            broadcast(wss, { type: "flavors:updated", flavors: state.flavors });
            break;
          }
          case "reservations:add": {
            const resData = msg.reservation;
            if (resData && resData.guestName) {
              state.reservations.unshift(resData);
              scheduleSave();
              broadcast(wss, { type: "reservations:updated", reservations: state.reservations });
            }
            break;
          }
          case "reservations:updateStatus": {
            const resId = String(msg.id || "");
            const newStatus = msg.status;
            const tableId = msg.tableId ? String(msg.tableId) : void 0;
            const target = state.reservations.find((r) => r.id === resId);
            if (target && newStatus) {
              target.status = newStatus;
              if (tableId) target.assignedTableId = tableId;
              scheduleSave();
              broadcast(wss, { type: "reservations:updated", reservations: state.reservations });
            }
            break;
          }
          case "reservations:delete": {
            const resId = String(msg.id || "");
            state.reservations = state.reservations.filter((r) => r.id !== resId);
            scheduleSave();
            broadcast(wss, { type: "reservations:updated", reservations: state.reservations });
            break;
          }
          case "shift:batchOut": {
            const staffName = String(msg.staffName || "Manager").trim() || "Manager";
            executeBatchOut(staffName);
            break;
          }
          case "template:apply": {
            const newTables = Array.isArray(msg.tables) ? msg.tables : [];
            const newFlavors = Array.isArray(msg.flavors) ? msg.flavors : [];
            if (newTables.length > 0) {
              state.tables = newTables;
            }
            if (newFlavors.length > 0) {
              state.flavors = newFlavors;
            }
            scheduleSave();
            broadcast(wss, { type: "state:init", snapshot: getSnapshot() });
            break;
          }
          case "state:resetDemo": {
            state.tables = createInitialTables(now);
            state.history = [];
            state.settings = { ...DEFAULT_SETTINGS };
            state.lastBatchReport = null;
            state.flavors = createInitialFlavors();
            scheduleSave();
            broadcast(wss, { type: "state:init", snapshot: getSnapshot() });
            break;
          }
        }
      } catch (err) {
        console.warn("Invalid WS message:", err);
      }
    });
    ws.on("close", () => {
      if (connectedStaff.delete(ws)) {
        broadcastPresence(wss);
      }
    });
  });
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3e3;
  server.listen(PORT, "0.0.0.0", () => {
    const wifiIps = getLocalWifiIps();
    console.log(`
==================================================`);
    console.log(`\u{1F680} SIN-OS Hookah POS Server is LIVE on port ${PORT}!`);
    console.log(`   Wi-Fi LAN IP Addresses for Staff Devices:`);
    wifiIps.forEach((ip) => {
      console.log(`   \u{1F449} http://${ip}:${PORT}`);
    });
    console.log(`==================================================
`);
  });
}
startServer();

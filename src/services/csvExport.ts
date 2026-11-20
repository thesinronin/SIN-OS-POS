import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { BatchReport, CompletedSession, LoungeTable } from '../types';

function escapeCsvCell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

export function generateShiftCsv(
  history: CompletedSession[],
  tables: LoungeTable[],
  staffName: string,
  batchReport?: BatchReport | null
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US');
  const timeStr = now.toLocaleTimeString('en-US');

  const rows: string[][] = [];

  // Title & Metadata
  rows.push(['SIN-OS Hookah Lounge POS — Shift Report']);
  rows.push(['Exported At', `${dateStr} ${timeStr}`]);
  rows.push(['Exported By', staffName || 'Staff']);
  rows.push([]);

  // Summary Metrics
  const closedRevenue = history.reduce((sum, s) => sum + s.total, 0);
  const closedSubtotal = history.reduce((sum, s) => sum + s.subtotal, 0);
  const closedDiscount = history.reduce((sum, s) => sum + (s.discount || 0), 0);
  const closedCash = history.reduce(
    (sum, s) => sum + (s.cashPaid ?? (s.paymentMethod === 'cash' ? s.total : 0)),
    0
  );
  const closedCard = history.reduce(
    (sum, s) =>
      sum +
      (s.cardPaid ??
        (s.paymentMethod === 'cash' ? 0 : s.total - (s.cashPaid ?? 0))),
    0
  );
  const openTablesCount = tables.filter((t) => t.status === 'occupied').length;
  const openRevenue = tables
    .filter((t) => t.status === 'occupied')
    .reduce(
      (sum, t) =>
        sum + t.orders.reduce((s, o) => s + o.unitPrice * o.quantity, 0),
      0
    );

  rows.push(['SHIFT FINANCIAL SUMMARY']);
  rows.push(['Total Closed Revenue', `$${closedRevenue.toFixed(2)}`]);
  rows.push(['Total Closed Subtotal', `$${closedSubtotal.toFixed(2)}`]);
  rows.push(['Total Discounts Applied', `$${closedDiscount.toFixed(2)}`]);
  rows.push(['Total Cash Paid', `$${closedCash.toFixed(2)}`]);
  rows.push(['Total Card Paid', `$${closedCard.toFixed(2)}`]);
  rows.push(['Closed Tabs Count', history.length.toString()]);
  rows.push(['Active Open Revenue', `$${openRevenue.toFixed(2)}`]);
  rows.push(['Active Open Tables', openTablesCount.toString()]);
  rows.push([]);

  if (batchReport) {
    rows.push(['LAST BATCH OUT ARCHIVE']);
    rows.push(['Batch ID', batchReport.id]);
    rows.push(['Closed At', new Date(batchReport.closedAt).toLocaleString('en-US')]);
    rows.push(['Closed By', batchReport.closedBy]);
    rows.push(['Total Tabs', batchReport.totalTabs.toString()]);
    rows.push(['Batch Total', `$${batchReport.total.toFixed(2)}`]);
    rows.push([]);
  }

  // Session / Tab Ledger
  rows.push(['CLOSED TABS LEDGER']);
  rows.push([
    'Table Name',
    'Floor',
    'Zone',
    'Guest / Party Name',
    'Party Size',
    'Duration (mins)',
    'Subtotal ($)',
    'Discount ($)',
    'Total Paid ($)',
    'Payment Method',
    'Cash Paid ($)',
    'Card Paid ($)',
    'Server',
    'Seated At',
    'Closed At',
    'Items Ordered',
  ]);

  history.forEach((session) => {
    const itemsSummary = session.orders
      .map((o) => `${o.quantity}x ${o.name}${o.flavors ? ` [${o.flavors.join(' + ')}]` : ''}`)
      .join(' | ');

    rows.push([
      session.tableName,
      session.floor,
      session.zone,
      session.guestName || '',
      session.partySize.toString(),
      session.durationMinutes.toString(),
      session.subtotal.toFixed(2),
      (session.discount || 0).toFixed(2),
      session.total.toFixed(2),
      session.paymentMethod || 'card',
      (session.cashPaid || 0).toFixed(2),
      (session.cardPaid || 0).toFixed(2),
      session.serverName || '',
      new Date(session.seatedAt).toLocaleTimeString('en-US'),
      new Date(session.closedAt).toLocaleTimeString('en-US'),
      itemsSummary,
    ]);
  });

  rows.push([]);

  // Popular Flavors Section
  const flavorCounts: Record<string, number> = {};
  history.forEach((session) => {
    session.orders.forEach((order) => {
      order.flavors?.forEach((flavor) => {
        flavorCounts[flavor] = (flavorCounts[flavor] || 0) + order.quantity;
      });
    });
  });

  const topFlavors = Object.entries(flavorCounts).sort((a, b) => b[1] - a[1]);

  rows.push(['SHISHA FLAVOR POPULARITY']);
  rows.push(['Flavor Name', 'Bowls Prepared']);
  topFlavors.forEach(([flavor, count]) => {
    rows.push([flavor, count.toString()]);
  });

  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

export async function downloadShiftCsv(
  history: CompletedSession[],
  tables: LoungeTable[],
  staffName: string,
  batchReport?: BatchReport | null
) {
  const csvContent = generateShiftCsv(history, tables, staffName, batchReport);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `HookahClose-${dateStr}.csv`;

  // 1. Save directly to Android/iOS device Documents folder
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.writeFile({
        path: filename,
        data: csvContent,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      alert(`Close out report saved to device Documents folder: ${filename}`);
      return;
    } catch (err) {
      console.warn('Capacitor Filesystem write error:', err);
    }
  }

  // 2. Try Web Share API (native share sheet on Android devices & tablets)
  try {
    const file = new File([csvContent], filename, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: `HookahClose Shift Report — ${dateStr}`,
        text: `HookahClose Shift Report — ${dateStr}`,
        files: [file],
      });
      return;
    }
  } catch {
    // Fall back to Data URI / Blob download below
  }

  // 3. Data URI download (bypasses Android WebView blob: restrictions)
  try {
    const encodedData = `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`;
    const link = document.createElement('a');
    link.setAttribute('href', encodedData);
    link.setAttribute('download', filename);
    link.setAttribute('target', '_blank');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  } catch {
    // Fall back to Blob URL
  }

  // 4. Blob URL Fallback
  try {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  } catch {
    // Fall back to Clipboard copy
  }

  // 5. Clipboard Copy Fallback (Guaranteed fallback)
  try {
    await navigator.clipboard.writeText(csvContent);
    alert(`CSV Shift Report copied to clipboard as ${filename}! You can paste it into Excel or Google Sheets.`);
  } catch {
    // Ignore clipboard error
  }
}

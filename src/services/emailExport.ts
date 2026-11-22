import type { BatchReport, CompletedSession, LoungeTable } from '../types';

export function generateEmailReportBody(
  history: CompletedSession[],
  tables: LoungeTable[],
  staffName: string,
  batchReport?: BatchReport | null
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const closedRevenue = history.reduce((sum, s) => sum + s.total, 0);
  const closedSubtotal = history.reduce((sum, s) => sum + s.subtotal, 0);
  const closedDiscount = history.reduce((sum, s) => sum + (s.discount || 0), 0);
  const closedSalesTax = history.reduce((sum, s) => sum + s.tax, 0);
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

  let totalBowls = 0;
  const flavorCounts: Record<string, number> = {};
  const storeItemCounts: Record<string, number> = {};

  history.forEach((session) => {
    session.orders.forEach((order) => {
      if (order.category === 'hookah' || order.category === 'refill') {
        totalBowls += order.quantity;
        order.flavors?.forEach((flavor) => {
          flavorCounts[flavor] = (flavorCounts[flavor] || 0) + order.quantity;
        });
      } else if (order.category === 'store') {
        storeItemCounts[order.name] = (storeItemCounts[order.name] || 0) + order.quantity;
      }
    });
  });

  const topFlavors = Object.entries(flavorCounts).sort((a, b) => b[1] - a[1]);
  const storeSales = Object.entries(storeItemCounts).sort((a, b) => b[1] - a[1]);

  const lines: string[] = [];
  lines.push(`SIN-OS Hookah Lounge POS — Daily Batch Shift Report`);
  lines.push(`Date: ${dateStr} at ${timeStr}`);
  lines.push(`Closed By: ${staffName || 'Staff'}`);
  lines.push(`----------------------------------------`);
  lines.push(`FINANCIAL SUMMARY:`);
  lines.push(`Total Profit (Revenue): $${closedRevenue.toFixed(2)}`);
  lines.push(`Subtotal: $${closedSubtotal.toFixed(2)}`);
  lines.push(`Sales Tax Collected: $${closedSalesTax.toFixed(2)}`);
  lines.push(`Discounts Applied: -$${closedDiscount.toFixed(2)}`);
  lines.push(`Cash Collected: $${closedCash.toFixed(2)}`);
  lines.push(`Card Payments: $${closedCard.toFixed(2)}`);
  lines.push(`Number of Seatings / Tabs: ${history.length}`);
  lines.push(`Total Bowls Sold: ${totalBowls}`);
  lines.push(`----------------------------------------`);

  if (batchReport) {
    lines.push(`BATCH OUT DETAILS:`);
    lines.push(`Batch ID: ${batchReport.id}`);
    lines.push(`Auto-Closed Open Tables: ${batchReport.autoClosedOpenTables}`);
    lines.push(`Batch Total: $${batchReport.total.toFixed(2)}`);
    lines.push(`----------------------------------------`);
  }

  lines.push(`SHISHA FLAVORS SOLD:`);
  if (topFlavors.length === 0) {
    lines.push(`(No flavors sold)`);
  } else {
    topFlavors.forEach(([flavor, count]) => {
      lines.push(`- ${flavor}: ${count} bowl(s)`);
    });
  }

  lines.push(`----------------------------------------`);
  lines.push(`STORE ITEMS SOLD:`);
  if (storeSales.length === 0) {
    lines.push(`(No store items sold)`);
  } else {
    storeSales.forEach(([item, count]) => {
      lines.push(`- ${item}: ${count} item(s)`);
    });
  }

  return lines.join('\n');
}

export function sendEmailBatchReport(
  history: CompletedSession[],
  tables: LoungeTable[],
  staffName: string,
  targetEmail?: string,
  batchReport?: BatchReport | null
): boolean {
  const dateStr = new Date().toLocaleDateString('en-US');
  const subject = `SIN-OS Shift Batch Report — ${dateStr}`;
  const body = generateEmailReportBody(history, tables, staffName, batchReport);

  const recipient = targetEmail?.trim() || '';
  const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  // Try opening mailto link
  try {
    window.location.href = mailtoUrl;
    return true;
  } catch {
    return false;
  }
}

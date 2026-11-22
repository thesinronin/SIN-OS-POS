import React from 'react';
import { Download, FileText, Mail, Power, Calendar } from 'lucide-react';
import { FLOORS } from '../data/menu';
import { downloadShiftCsv } from '../services/csvExport';
import { sendEmailBatchReport } from '../services/emailExport';
import type { BatchReport, CompletedSession, LoungeReservation, LoungeTable } from '../types';

interface AnalyticsScreenProps {
  tables: LoungeTable[];
  history: CompletedSession[];
  lastBatchReport: BatchReport | null;
  reservations?: LoungeReservation[];
  staffName?: string;
  managerEmail?: string;
  onOpenExportDocs: (batch?: BatchReport | null) => void;
  onOpenBatchOut: () => void;
}

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({
  tables,
  history,
  lastBatchReport,
  reservations = [],
  staffName = 'Staff',
  managerEmail = '',
  onOpenExportDocs,
  onOpenBatchOut,
}) => {
  const closedRevenue = history.reduce((sum, s) => sum + s.total, 0);
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

  const todayStart = new Date().setHours(0, 0, 0, 0);
  const reservationsToday = reservations.filter(
    (r) => r.createdAt >= todayStart || r.reservationTime >= todayStart
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

  // Also include active open tables in real-time counts
  tables.forEach((t) => {
    t.orders.forEach((order) => {
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

  return (
    <div className="space-y-6">
      {/* Shift End-of-Day Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border cyber-surface p-4">
        <div>
          <h1 className="text-base font-bold text-slate-100">
            Shift Analytics &amp; End-of-Day Close
          </h1>
          <p className="text-xs text-slate-400">
            Total Profit / Revenue:{' '}
            <strong className="font-mono text-cyan-300 tabular-nums">
              ${closedRevenue.toFixed(2)}
            </strong>{' '}
            ({history.length} seatings · {reservationsToday.length} reservations today)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadShiftCsv(history, tables, staffName, lastBatchReport, reservationsToday)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-400/40 bg-[#060913] px-3.5 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:border-emerald-300 hover:bg-emerald-500/10 whitespace-nowrap"
          >
            <Download className="h-4 w-4 text-emerald-400" />
            Download Shift CSV
          </button>

          <button
            type="button"
            onClick={() => sendEmailBatchReport(history, tables, staffName, managerEmail, lastBatchReport, reservationsToday)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-fuchsia-400/40 bg-[#060913] px-3.5 py-2 text-xs font-semibold text-fuchsia-200 transition-colors hover:border-fuchsia-300 hover:bg-fuchsia-500/10 whitespace-nowrap"
          >
            <Mail className="h-4 w-4 text-fuchsia-400" />
            Email Shift Report
          </button>

          <button
            type="button"
            onClick={() => onOpenExportDocs(null)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-cyan-400/40 bg-[#060913] px-3.5 py-2 text-xs font-semibold text-cyan-200 transition-colors hover:border-cyan-300 hover:bg-cyan-500/10 whitespace-nowrap"
          >
            <FileText className="h-4 w-4 text-cyan-400" />
            Google Docs Report
          </button>

          <button
            type="button"
            onClick={onOpenBatchOut}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-fuchsia-500 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-fuchsia-400 cyber-glow-magenta whitespace-nowrap"
          >
            <Power className="h-4 w-4" />
            Close All Tables &amp; Batch Out
          </button>
        </div>
      </div>

      {/* Last Batch Out Archive Banner */}
      {lastBatchReport && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/35 bg-emerald-500/[0.07] p-4 cyber-glow-emerald">
          <div>
            <p className="text-xs font-semibold text-emerald-300">
              Last Batch Out ·{' '}
              {new Date(lastBatchReport.closedAt).toLocaleString('en-US')}
            </p>
            <p className="mt-0.5 text-sm text-slate-200">
              Batched{' '}
              <strong className="font-mono text-emerald-300 tabular-nums">
                ${lastBatchReport.total.toFixed(2)}
              </strong>{' '}
              across {lastBatchReport.totalTabs} seating
              {lastBatchReport.totalTabs === 1 ? '' : 's'} · Closed by{' '}
              {lastBatchReport.closedBy}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => downloadShiftCsv(lastBatchReport.sessions, [], lastBatchReport.closedBy, lastBatchReport)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-400/40 bg-[#060913] px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              Download Batch CSV
            </button>
            <button
              type="button"
              onClick={() => onOpenExportDocs(lastBatchReport)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-cyan-400/40 bg-[#060913] px-3.5 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10 whitespace-nowrap"
            >
              <FileText className="h-4 w-4" />
              Google Docs Report
            </button>
          </div>
        </div>
      )}

      {/* KPI Streamlined Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border cyber-surface p-4">
          <p className="text-xs text-slate-400">Total Profit / Revenue</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-cyan-300 tabular-nums">
            ${closedRevenue.toFixed(2)}
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">
            Cash ${closedCash.toFixed(2)} · Card ${closedCard.toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl border cyber-surface p-4">
          <p className="text-xs text-slate-400">Number of Seatings</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
            {history.length}
          </p>
        </div>
        <div className="rounded-2xl border cyber-surface p-4">
          <p className="text-xs text-slate-400">Bowls Sold</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-fuchsia-300 tabular-nums">
            {totalBowls}
          </p>
        </div>
        <div className="rounded-2xl border cyber-surface p-4">
          <p className="text-xs text-slate-400">Store Items Sold</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-amber-300 tabular-nums">
            {Object.values(storeItemCounts).reduce((a, b) => a + b, 0)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Flavors Sold List */}
        <section className="rounded-2xl border cyber-surface p-5">
          <h2 className="text-base font-bold text-slate-100 mb-4">
            Shisha Flavors Sold
          </h2>
          {topFlavors.length === 0 ? (
            <p className="text-xs text-slate-500">
              No flavor sales recorded yet during this shift.
            </p>
          ) : (
            <div className="divide-y divide-cyan-500/10 max-h-80 overflow-y-auto pr-1">
              {topFlavors.map(([flavor, count]) => (
                <div
                  key={flavor}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <span className="font-medium text-slate-200">{flavor}</span>
                  <span className="font-mono text-xs font-semibold text-cyan-300 tabular-nums">
                    {count} bowl{count === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Store Items Sold List */}
        <section className="rounded-2xl border cyber-surface p-5">
          <h2 className="text-base font-bold text-slate-100 mb-4">
            Store Items Sold
          </h2>
          {storeSales.length === 0 ? (
            <p className="text-xs text-slate-500">
              No store items sold yet during this shift.
            </p>
          ) : (
            <div className="divide-y divide-cyan-500/10 max-h-80 overflow-y-auto pr-1">
              {storeSales.map(([item, count]) => (
                <div
                  key={item}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <span className="font-medium text-slate-200">{item}</span>
                  <span className="font-mono text-xs font-semibold text-amber-300 tabular-nums">
                    {count} item{count === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Reservations Made Today Section */}
      <section className="rounded-2xl border cyber-surface p-5">
        <h2 className="text-base font-bold text-slate-100 mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-cyan-400" />
            Reservations Made Today ({reservationsToday.length})
          </span>
        </h2>
        {reservationsToday.length === 0 ? (
          <p className="text-xs text-slate-500">
            No reservations booked or scheduled for today yet.
          </p>
        ) : (
          <div className="divide-y divide-cyan-500/10 max-h-80 overflow-y-auto pr-1">
            {reservationsToday.map((res) => {
              const resTime = new Date(res.reservationTime).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              });
              return (
                <div key={res.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <span className="font-bold text-slate-100">{res.guestName}</span>
                    <span className="text-xs text-slate-400 font-mono ml-2">
                      Party of {res.partySize} · {res.floor || 'Floor 1'}
                    </span>
                    {res.notes && <p className="text-[11px] text-slate-400 italic">"{res.notes}"</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-cyan-300">{resTime}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase ${
                        res.status === 'scheduled'
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : res.status === 'seated'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {res.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

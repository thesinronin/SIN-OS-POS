import React, { useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Crown,
  ExternalLink,
  FileText,
  List,
  Phone,
  Plus,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { SEATING_TIER_LIST } from '../data/menu';
import { saveReservationsTextDocument } from '../services/reservationExport';
import { buildGoogleCalendarEventUrl } from '../services/googleCalendarSync';
import { ReservationCalendarView } from '../components/ReservationCalendarView';
import type {
  LoungeReservation,
  LoungeTable,
  ReservationStatus,
  SeatingTierId,
  TableFloor,
} from '../types';

interface ReservationsScreenProps {
  reservations: LoungeReservation[];
  tables: LoungeTable[];
  staffName: string;
  onAddReservation: (reservation: Omit<LoungeReservation, 'id' | 'createdAt'>) => void;
  onUpdateReservationStatus: (id: string, status: ReservationStatus, tableId?: string) => void;
  onDeleteReservation: (id: string) => void;
  onSeatTable: (
    tableId: string,
    partySize: number,
    guestName?: string,
    seatingTier?: SeatingTierId
  ) => void;
}

export const ReservationsScreen: React.FC<ReservationsScreenProps> = ({
  reservations,
  tables,
  staffName,
  onAddReservation,
  onUpdateReservationStatus,
  onDeleteReservation,
  onSeatTable,
}) => {
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | 'all'>('scheduled');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Book Reservation Modal State
  const [isBookOpen, setIsBookOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState(4);
  const [resDateStr, setResDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [resTimeStr, setResTimeStr] = useState('20:00');
  const [preferredFloor, setPreferredFloor] = useState<TableFloor>('Floor 1');
  const [preferredTier, setPreferredTier] = useState<SeatingTierId>('downstairs');
  const [notes, setNotes] = useState('');

  // Seating Modal State
  const [seatingReservation, setSeatingReservation] = useState<LoungeReservation | null>(null);
  const [selectedTableId, setSelectedTableId] = useState('');

  const scheduledList = reservations.filter((r) => r.status === 'scheduled');
  const filteredList =
    filterStatus === 'all'
      ? reservations
      : reservations.filter((r) => r.status === filterStatus);

  const availableTables = tables.filter((t) => t.status === 'available');

  const handleBookSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = guestName.trim();
    if (!name) return;

    const dateTimeCombined = new Date(`${resDateStr}T${resTimeStr}`);
    const resTimeMs = isNaN(dateTimeCombined.getTime())
      ? Date.now() + 3600000
      : dateTimeCombined.getTime();

    onAddReservation({
      guestName: name,
      phone: phone.trim() || undefined,
      partySize: Math.max(1, partySize || 1),
      reservationTime: resTimeMs,
      floor: preferredFloor,
      preferredTier,
      notes: notes.trim() || undefined,
      status: 'scheduled',
      createdBy: staffName,
    });

    setGuestName('');
    setPhone('');
    setPartySize(4);
    setNotes('');
    setIsBookOpen(false);
  };

  const handleConfirmSeatParty = () => {
    if (!seatingReservation || !selectedTableId) return;

    onSeatTable(
      selectedTableId,
      seatingReservation.partySize,
      seatingReservation.guestName,
      seatingReservation.preferredTier || 'downstairs'
    );

    onUpdateReservationStatus(seatingReservation.id, 'seated', selectedTableId);
    setSeatingReservation(null);
    setSelectedTableId('');
    alert(`Party ${seatingReservation.guestName} seated successfully!`);
  };

  return (
    <div className="space-y-4">
      {/* Header Summary & Booking Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/25 bg-[#0B101D] p-4 shadow-[0_0_30px_rgba(6,182,212,0.12)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 text-slate-950 font-bold">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 font-display tracking-wide">
              Table Reservations &amp; Bookings
            </h1>
            <p className="text-xs text-slate-400">
              <span className="text-emerald-400 font-mono font-bold">
                {scheduledList.length} upcoming
              </span>
              {' · Schedule, manage, & seat reserved parties in 1 tap'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => saveReservationsTextDocument(reservations, staffName)}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20 transition-colors"
          >
            <FileText className="h-4 w-4 text-cyan-400" />
            Save Text Document (.txt)
          </button>

          <button
            type="button"
            onClick={() => setIsBookOpen(true)}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-cyan-400 px-4 text-xs font-bold text-slate-950 hover:bg-cyan-300 cyber-glow-cyan"
          >
            <Plus className="h-4 w-4" />
            Book New Reservation
          </button>
        </div>
      </div>

      {/* Filter Tabs & View Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(
            [
              { id: 'scheduled', label: `Scheduled (${scheduledList.length})` },
              { id: 'seated', label: 'Seated' },
              { id: 'cancelled', label: 'Cancelled / No-Show' },
              { id: 'all', label: `All (${reservations.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id)}
              className={`min-h-[38px] rounded-xl border px-3 text-xs font-bold transition-colors whitespace-nowrap ${
                filterStatus === tab.id
                  ? 'border-cyan-400 bg-cyan-400 text-slate-950 cyber-glow-cyan'
                  : 'border-cyan-500/20 bg-[#060913] text-slate-300 hover:border-cyan-400/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center rounded-xl border border-cyan-500/25 bg-[#060913] p-1">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`flex min-h-[32px] items-center gap-1 rounded-lg px-3 text-xs font-bold transition-colors ${
              viewMode === 'list'
                ? 'bg-cyan-400 text-slate-950 cyber-glow-cyan'
                : 'text-slate-400 hover:text-cyan-200'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`flex min-h-[32px] items-center gap-1 rounded-lg px-3 text-xs font-bold transition-colors ${
              viewMode === 'calendar'
                ? 'bg-cyan-400 text-slate-950 cyber-glow-cyan'
                : 'text-slate-400 hover:text-cyan-200'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            Calendar Grid
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <ReservationCalendarView
          reservations={filteredList}
          onSelectDate={() => {}}
          onSelectReservation={(res) => {
            setSeatingReservation(res);
            setSelectedTableId('');
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredList.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-cyan-500/20 p-8 text-center text-xs text-slate-400">
            No {filterStatus} reservations found. Tap "Book New Reservation" to schedule a booking.
          </div>
        ) : (
          filteredList.map((res) => {
            const timeDate = new Date(res.reservationTime);
            const dateDisplay = timeDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });
            const timeDisplay = timeDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            });

            return (
              <div
                key={res.id}
                className={`flex flex-col justify-between rounded-2xl border p-4 space-y-3 shadow-lg transition-colors ${
                  res.status === 'scheduled'
                    ? 'border-cyan-500/30 bg-[#0B101D] hover:border-cyan-400/60'
                    : res.status === 'seated'
                    ? 'border-emerald-500/30 bg-emerald-500/[0.05]'
                    : 'border-slate-800 bg-[#060913]/60 opacity-60'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-100 font-display">
                        {res.guestName}
                      </h3>
                      {res.phone && (
                        <p className="flex items-center gap-1 text-xs text-cyan-300 font-mono mt-0.5">
                          <Phone className="h-3 w-3" />
                          {res.phone}
                        </p>
                      )}
                    </div>

                    <span
                      className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase font-mono ${
                        res.status === 'scheduled'
                          ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-300'
                          : res.status === 'seated'
                          ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                          : 'border-slate-700 bg-slate-900 text-slate-400'
                      }`}
                    >
                      {res.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-cyan-500/15 pt-2">
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <Clock className="h-3.5 w-3.5 text-cyan-400" />
                      <span className="font-mono font-semibold">
                        {dateDisplay} at {timeDisplay}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-300">
                      <Users className="h-3.5 w-3.5 text-cyan-400" />
                      <span className="font-mono font-semibold">
                        Party of {res.partySize}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>Floor: {res.floor || 'Floor 1'}</span>
                    <span>·</span>
                    <span className="uppercase">{res.preferredTier || 'Downstairs'}</span>
                  </div>

                  {res.notes && (
                    <p className="text-xs italic text-slate-300 bg-[#060913] p-2 rounded-xl border border-cyan-500/15">
                      "{res.notes}"
                    </p>
                  )}

                  <a
                    href={buildGoogleCalendarEventUrl(res)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 transition-colors pt-1"
                  >
                    <ExternalLink className="h-3 w-3 text-cyan-400" />
                    Add to Google Calendar
                  </a>
                </div>

                {/* Reservation Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-cyan-500/15">
                  {res.status === 'scheduled' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSeatingReservation(res);
                        setSelectedTableId('');
                      }}
                      className="flex-1 flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-emerald-400 px-3 text-xs font-bold text-slate-950 hover:bg-emerald-300 cyber-glow-emerald"
                    >
                      <UserCheck className="h-4 w-4" />
                      Seat Party Now
                    </button>
                  )}

                  {res.status === 'scheduled' && (
                    <button
                      type="button"
                      onClick={() => onUpdateReservationStatus(res.id, 'cancelled')}
                      className="min-h-[38px] rounded-xl border border-rose-500/30 px-3 text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
                    >
                      Cancel
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onDeleteReservation(res.id)}
                    className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-700 text-slate-400 hover:border-rose-500/50 hover:text-rose-300"
                    aria-label="Delete reservation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      )}

      {/* Modal 1: Book New Reservation */}
      {isBookOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setIsBookOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-cyan-500/30 bg-[#0A0F1C] p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2.5">
              <h3 className="text-base font-bold text-slate-100 font-display">
                Book New Table Reservation
              </h3>
              <button
                type="button"
                onClick={() => setIsBookOpen(false)}
                className="text-slate-400 hover:text-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleBookSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Guest Name *
                </label>
                <input
                  type="text"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g. Marcus Allen"
                  className="w-full min-h-[42px] rounded-xl border border-cyan-500/30 bg-[#060913] px-3.5 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 234-5678"
                    className="w-full min-h-[42px] rounded-xl border border-cyan-500/30 bg-[#060913] px-3.5 py-2 font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Party Size
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={partySize}
                    onChange={(e) => setPartySize(parseInt(e.target.value, 10) || 1)}
                    className="w-full min-h-[42px] rounded-xl border border-cyan-500/30 bg-[#060913] px-3.5 py-2 font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={resDateStr}
                    onChange={(e) => setResDateStr(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-cyan-500/30 bg-[#060913] px-3 py-2 font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    value={resTimeStr}
                    onChange={(e) => setResTimeStr(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-cyan-500/30 bg-[#060913] px-3 py-2 font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Preferred Floor
                  </label>
                  <select
                    value={preferredFloor}
                    onChange={(e) => setPreferredFloor(e.target.value as TableFloor)}
                    className="w-full min-h-[42px] rounded-xl border border-cyan-500/30 bg-[#060913] px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="Floor 1">Floor 1</option>
                    <option value="Floor 2">Floor 2</option>
                    <option value="Outside">Outside</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Preferred Tier
                  </label>
                  <select
                    value={preferredTier}
                    onChange={(e) => setPreferredTier(e.target.value as SeatingTierId)}
                    className="w-full min-h-[42px] rounded-xl border border-cyan-500/30 bg-[#060913] px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                  >
                    {SEATING_TIER_LIST.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Special Notes / Preferences
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Birthday celebration, booth near DJ"
                  className="w-full min-h-[42px] rounded-xl border border-cyan-500/30 bg-[#060913] px-3.5 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBookOpen(false)}
                  className="flex-1 min-h-[44px] rounded-xl border border-cyan-500/30 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!guestName.trim()}
                  className="flex-1 min-h-[44px] rounded-xl bg-cyan-400 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-40"
                >
                  Save Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: 1-Tap Seat Reserved Party */}
      {seatingReservation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setSeatingReservation(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-emerald-500/40 bg-[#0A0F1C] p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2.5">
              <div>
                <h3 className="text-base font-bold text-slate-100 font-display">
                  Seat Reserved Party: {seatingReservation.guestName}
                </h3>
                <p className="text-xs text-emerald-400 font-mono">
                  Party of {seatingReservation.partySize} · Preferred {seatingReservation.floor || 'Floor 1'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSeatingReservation(null)}
                className="text-slate-400 hover:text-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                Select Available Table to Seat:
              </label>

              {availableTables.length === 0 ? (
                <p className="rounded-xl border border-dashed border-amber-500/30 p-4 text-center text-xs text-amber-300">
                  No tables currently available. Clear or checkout a table first!
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {availableTables.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTableId(t.id)}
                      className={`flex flex-col items-start p-3 rounded-xl border text-left transition-colors ${
                        selectedTableId === t.id
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200 cyber-glow-emerald'
                          : 'border-cyan-500/20 bg-[#060913] text-slate-300 hover:border-cyan-400/50'
                      }`}
                    >
                      <span className="font-bold text-xs">
                        {t.tableNumber ? `#${t.tableNumber} ${t.name}` : t.name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {t.floor} · {t.seats} seats
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSeatingReservation(null)}
                  className="flex-1 min-h-[44px] rounded-xl border border-cyan-500/30 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedTableId}
                  onClick={handleConfirmSeatParty}
                  className="flex-1 min-h-[44px] rounded-xl bg-emerald-400 text-xs font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-40 cyber-glow-emerald"
                >
                  Confirm &amp; Seat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

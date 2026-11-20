import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Users } from 'lucide-react';
import type { LoungeReservation } from '../types';

interface ReservationCalendarViewProps {
  reservations: LoungeReservation[];
  onSelectDate: (date: Date) => void;
  onSelectReservation: (res: LoungeReservation) => void;
}

export const ReservationCalendarView: React.FC<ReservationCalendarViewProps> = ({
  reservations,
  onSelectDate,
  onSelectReservation,
}) => {
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  const monthName = currentMonthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
    setSelectedDay(null);
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
    setSelectedDay(null);
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentMonthDate(today);
    setSelectedDay(today.getDate());
    onSelectDate(today);
  };

  // Map reservations by day of the current month
  const reservationsByDay: Record<number, LoungeReservation[]> = {};
  reservations.forEach((res) => {
    const d = new Date(res.reservationTime);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const dayNum = d.getDate();
      if (!reservationsByDay[dayNum]) reservationsByDay[dayNum] = [];
      reservationsByDay[dayNum].push(res);
    }
  });

  const selectedDayReservations = selectedDay ? reservationsByDay[selectedDay] || [] : [];

  return (
    <div className="space-y-4">
      {/* Calendar Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-cyan-500/25 bg-[#0B101D] p-3.5 shadow-lg">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-cyan-400" />
          <h2 className="text-base font-bold text-slate-100 font-display tracking-wide">
            {monthName}
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleToday}
            className="min-h-[36px] rounded-xl border border-cyan-500/30 bg-[#060913] px-3 text-xs font-semibold text-cyan-200 hover:border-cyan-400"
          >
            Today
          </button>
          <button
            type="button"
            onClick={handlePrevMonth}
            className="flex h-[36px] w-[36px] items-center justify-center rounded-xl border border-cyan-500/25 bg-[#060913] text-slate-300 hover:border-cyan-400"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="flex h-[36px] w-[36px] items-center justify-center rounded-xl border border-cyan-500/25 bg-[#060913] text-slate-300 hover:border-cyan-400"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Monthly Grid */}
      <div className="rounded-2xl border border-cyan-500/25 bg-[#0B101D] p-3 sm:p-4 shadow-xl overflow-hidden">
        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-cyan-300/80 mb-2 font-display">
          <span>SUN</span>
          <span>MON</span>
          <span>TUE</span>
          <span>WED</span>
          <span>THU</span>
          <span>FRI</span>
          <span>SAT</span>
        </div>

        {/* Days Cells */}
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {/* Empty cells before month start */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[64px] sm:min-h-[84px] rounded-xl bg-slate-900/30 border border-transparent opacity-30" />
          ))}

          {/* Month Days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dayRes = reservationsByDay[dayNum] || [];
            const isToday =
              new Date().getDate() === dayNum &&
              new Date().getMonth() === month &&
              new Date().getFullYear() === year;
            const isSelected = selectedDay === dayNum;

            return (
              <button
                key={`day-${dayNum}`}
                type="button"
                onClick={() => {
                  setSelectedDay(dayNum);
                  onSelectDate(new Date(year, month, dayNum));
                }}
                className={`flex min-h-[64px] sm:min-h-[84px] flex-col justify-between p-1.5 sm:p-2 rounded-xl border text-left transition-colors ${
                  isSelected
                    ? 'border-cyan-400 bg-cyan-500/15 text-slate-100 cyber-glow-cyan'
                    : isToday
                    ? 'border-fuchsia-400/80 bg-fuchsia-500/10 text-slate-100'
                    : dayRes.length > 0
                    ? 'border-cyan-500/30 bg-[#060913] text-slate-200 hover:border-cyan-400/60'
                    : 'border-cyan-500/10 bg-[#060913]/40 text-slate-400 hover:border-cyan-500/30'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`font-mono text-xs font-bold ${
                      isToday ? 'text-fuchsia-300' : isSelected ? 'text-cyan-300' : 'text-slate-300'
                    }`}
                  >
                    {dayNum}
                  </span>
                  {dayRes.length > 0 && (
                    <span className="rounded-full bg-emerald-400 px-1.5 text-[9px] font-mono font-bold text-slate-950">
                      {dayRes.length}
                    </span>
                  )}
                </div>

                {/* Reservation Badge Previews */}
                <div className="space-y-1 w-full overflow-hidden">
                  {dayRes.slice(0, 2).map((r) => {
                    const timeStr = new Date(r.reservationTime).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    });
                    return (
                      <div
                        key={r.id}
                        className={`truncate rounded px-1 text-[9px] font-bold ${
                          r.status === 'scheduled'
                            ? 'bg-cyan-500/25 text-cyan-200'
                            : r.status === 'seated'
                            ? 'bg-emerald-500/25 text-emerald-200'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {timeStr} {r.guestName}
                      </div>
                    );
                  })}
                  {dayRes.length > 2 && (
                    <span className="text-[9px] font-mono text-cyan-400/80 block">
                      +{dayRes.length - 2} more
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Reservations Detail Panel */}
      {selectedDay !== null && (
        <div className="space-y-2 rounded-2xl border border-cyan-500/25 bg-[#0B101D] p-4 shadow-lg">
          <h3 className="text-sm font-bold text-slate-100 font-display flex items-center justify-between">
            <span>
              Bookings for {monthName.split(' ')[0]} {selectedDay}, {year}
            </span>
            <span className="font-mono text-xs text-cyan-300">
              {selectedDayReservations.length} reservations
            </span>
          </h3>

          {selectedDayReservations.length === 0 ? (
            <p className="p-4 text-center text-xs text-slate-400">
              No reservations scheduled for this day.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {selectedDayReservations.map((r) => {
                const timeStr = new Date(r.reservationTime).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                });
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onSelectReservation(r)}
                    className="flex items-center justify-between gap-2 rounded-xl border border-cyan-500/20 bg-[#060913] p-3 text-left hover:border-cyan-400/60 transition-colors"
                  >
                    <div>
                      <span className="font-bold text-xs text-slate-100 block">
                        {r.guestName} ({r.partySize}p)
                      </span>
                      <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                        <Clock className="h-3 w-3 text-cyan-400" />
                        {timeStr} · {r.floor || 'Floor 1'}
                      </span>
                    </div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase ${
                        r.status === 'scheduled'
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : r.status === 'seated'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {r.status}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

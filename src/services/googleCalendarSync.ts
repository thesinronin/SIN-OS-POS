import type { LoungeReservation } from '../types';
import { showToast } from './toastNotice';

/**
 * Generates a direct Google Calendar event creation URL (Web / Mobile App link).
 * Allows staff to 1-tap add any lounge reservation directly into their Google Calendar.
 */
export function buildGoogleCalendarEventUrl(reservation: LoungeReservation): string {
  const startTime = new Date(reservation.reservationTime);
  const endTime = new Date(reservation.reservationTime + 2 * 60 * 60 * 1000); // Default 2h duration

  const formatIsoDate = (d: Date) =>
    d.toISOString().replace(/-|:|\.\d+/g, '');

  const title = encodeURIComponent(
    `Hookah Reservation: ${reservation.guestName} (${reservation.partySize} People)`
  );

  const details = encodeURIComponent(
    `Guest Name: ${reservation.guestName}\n` +
      `Party Size: ${reservation.partySize} People\n` +
      `Phone: ${reservation.phone || 'N/A'}\n` +
      `Preferred Floor: ${reservation.floor || 'Floor 1'}\n` +
      `Preferred Tier: ${(reservation.preferredTier || 'downstairs').toUpperCase()}\n` +
      `Notes: ${reservation.notes || 'None'}\n\n` +
      `Created via SIN-OS Hookah Lounge POS`
  );

  const location = encodeURIComponent(
    `Southern Sands Hookah Lounge — ${reservation.floor || 'Floor 1'}`
  );

  const datesParam = `${formatIsoDate(startTime)}/${formatIsoDate(endTime)}`;

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${datesParam}&details=${details}&location=${location}`;
}

/**
 * Generates an iCalendar (.ics) format file string for Google Calendar import.
 */
export function generateReservationsIcsFile(reservations: LoungeReservation[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SIN-OS Hookah Lounge POS//Reservations Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Southern Sands Hookah Reservations',
  ];

  reservations.forEach((res) => {
    const start = new Date(res.reservationTime);
    const end = new Date(res.reservationTime + 2 * 3600000);
    const formatUtc = (d: Date) => d.toISOString().replace(/-|:|\.\d+/g, '');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:res-${res.id}@southernsands.pos`);
    lines.push(`DTSTAMP:${formatUtc(new Date())}`);
    lines.push(`DTSTART:${formatUtc(start)}`);
    lines.push(`DTEND:${formatUtc(end)}`);
    lines.push(`SUMMARY:Hookah Reservation: ${res.guestName} (${res.partySize} People)`);
    lines.push(
      `DESCRIPTION:Guest: ${res.guestName}\\nParty: ${res.partySize} People\\nPhone: ${res.phone || 'N/A'}\\nFloor: ${res.floor || 'Floor 1'}\\nNotes: ${res.notes || 'None'}`
    );
    lines.push(`LOCATION:Southern Sands Hookah Lounge - ${res.floor || 'Floor 1'}`);
    lines.push(`STATUS:${res.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`);
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Downloads / Exports .ics file directly to device for 1-tap Google Calendar import.
 */
export async function downloadReservationsIcs(reservations: LoungeReservation[]) {
  const csData = generateReservationsIcsFile(reservations);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `HookahReservations-${dateStr}.ics`;

  try {
    const encodedData = `data:text/calendar;charset=utf-8,${encodeURIComponent(csData)}`;
    const link = document.createElement('a');
    link.setAttribute('href', encodedData);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${reservations.length} reservations to ${filename}! You can import this file directly into Google Calendar.`, 'As You Wish ✨');
  } catch (err) {
    console.error('Failed to export .ics calendar file:', err);
  }
}

/**
 * Modular hook for future full Google Calendar API OAuth 2.0 two-way sync.
 */
export async function syncToGoogleCalendarApi(
  _reservation: LoungeReservation,
  _oauthToken?: string
): Promise<{ ok: boolean; eventId?: string; error?: string }> {
  // Room reserved for direct Google Calendar REST API v3 sync integration
  return { ok: true, eventId: `gcal-${Date.now()}` };
}

import type { LoungeReservation } from '../types';

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
 * Modular hook for future full Google Calendar API OAuth 2.0 two-way sync.
 */
export async function syncToGoogleCalendarApi(
  _reservation: LoungeReservation,
  _oauthToken?: string
): Promise<{ ok: boolean; eventId?: string; error?: string }> {
  // Room reserved for direct Google Calendar REST API v3 sync integration
  return { ok: true, eventId: `gcal-${Date.now()}` };
}

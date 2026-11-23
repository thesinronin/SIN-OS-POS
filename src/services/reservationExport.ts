import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { LoungeReservation } from '../types';
import { showToast } from './toastNotice';

export function generateReservationsTextReport(
  reservations: LoungeReservation[],
  staffName: string
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const scheduled = reservations.filter((r) => r.status === 'scheduled');
  const seated = reservations.filter((r) => r.status === 'seated');
  const cancelled = reservations.filter((r) => r.status === 'cancelled' || r.status === 'noshow');

  const lines: string[] = [];
  lines.push('==================================================');
  lines.push('SIN-OS HOOKAH LOUNGE POS — RESERVATIONS REPORT');
  lines.push(`Exported At: ${dateStr} ${timeStr}`);
  lines.push(`Exported By: ${staffName || 'Staff'}`);
  lines.push('==================================================');
  lines.push('');

  lines.push(`UPCOMING & SCHEDULED BOOKINGS (${scheduled.length})`);
  lines.push('--------------------------------------------------');
  if (scheduled.length === 0) {
    lines.push('No upcoming scheduled reservations.');
  } else {
    scheduled.forEach((res, idx) => {
      const resDate = new Date(res.reservationTime);
      lines.push(`${idx + 1}. ${res.guestName.toUpperCase()}`);
      if (res.phone) lines.push(`   Phone: ${res.phone}`);
      lines.push(`   Party Size: ${res.partySize} People`);
      lines.push(
        `   Date & Time: ${resDate.toLocaleDateString('en-US')} at ${resDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      );
      lines.push(`   Preferred Floor: ${res.floor || 'Floor 1'}`);
      lines.push(`   Preferred Tier: ${(res.preferredTier || 'Downstairs').toUpperCase()}`);
      if (res.notes) lines.push(`   Notes: ${res.notes}`);
      lines.push(`   Status: ${res.status.toUpperCase()}`);
      lines.push('');
    });
  }

  lines.push('');
  lines.push(`SEATED RESERVATIONS (${seated.length})`);
  lines.push('--------------------------------------------------');
  if (seated.length === 0) {
    lines.push('No seated reservations.');
  } else {
    seated.forEach((res, idx) => {
      lines.push(`${idx + 1}. ${res.guestName} (${res.partySize} people) — Table ${res.assignedTableId || 'Assigned'}`);
    });
  }

  lines.push('');
  lines.push(`CANCELLED / NO-SHOW BOOKINGS (${cancelled.length})`);
  lines.push('--------------------------------------------------');
  if (cancelled.length === 0) {
    lines.push('No cancelled bookings.');
  } else {
    cancelled.forEach((res, idx) => {
      lines.push(`${idx + 1}. ${res.guestName} (${res.partySize} people) — Status: ${res.status.toUpperCase()}`);
    });
  }

  return lines.join('\n');
}

export async function saveReservationsTextDocument(
  reservations: LoungeReservation[],
  staffName: string
) {
  const textContent = generateReservationsTextReport(reservations, staffName);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `HookahReservations-${dateStr}.txt`;

  // 1. Try Native Capacitor Filesystem save to device Documents folder
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.writeFile({
        path: filename,
        data: textContent,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      showToast(`Reservations text document saved to device Documents folder: ${filename}`, 'As You Wish ✨');
      return;
    } catch (err) {
      console.warn('Capacitor Filesystem reservations write error:', err);
    }
  }

  // 2. Try Web Share API (native share on mobile)
  try {
    const file = new File([textContent], filename, { type: 'text/plain' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: `Hookah Reservations — ${dateStr}`,
        text: `Hookah Reservations Text Document — ${dateStr}`,
        files: [file],
      });
      return;
    }
  } catch {
    // Fall back to Data URI / Blob download below
  }

  // 3. Data URI download fallback
  try {
    const encodedData = `data:text/plain;charset=utf-8,${encodeURIComponent(textContent)}`;
    const link = document.createElement('a');
    link.setAttribute('href', encodedData);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  } catch {
    // Fall back to Clipboard copy
  }

  // 4. Clipboard Copy Fallback
  try {
    await navigator.clipboard.writeText(textContent);
    showToast(`Reservations report copied to clipboard as ${filename}! You can paste it into any text document or notes app.`, 'As You Wish ✨');
  } catch {
    // Ignore error
  }
}

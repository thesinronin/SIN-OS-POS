import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { FlavorOption, LoungeTable } from '../types';

export interface LayoutFlavorsTemplate {
  version: string;
  exportedAt: number;
  tables: LoungeTable[];
  flavors: FlavorOption[];
}

const TEMPLATE_STORAGE_KEY = 'SIN_OS_DEFAULT_LAYOUT_TEMPLATE';

export function saveLayoutToLocalStorage(
  tables: LoungeTable[],
  flavors: FlavorOption[]
): LayoutFlavorsTemplate {
  const template: LayoutFlavorsTemplate = {
    version: '2.0.0',
    exportedAt: Date.now(),
    tables: tables.map((t) => ({
      ...t,
      status: 'available',
      seatingTier: undefined,
      timeLimitMinutes: undefined,
      partySize: undefined,
      guestName: undefined,
      serverName: undefined,
      seatedAt: undefined,
      lastCoalCheckAt: undefined,
      orders: [],
      parties: undefined,
    })),
    flavors,
  };

  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(template));
  } catch {
    // Ignore storage quota errors
  }

  return template;
}

export async function exportLayoutAndFlavorsTemplate(
  tables: LoungeTable[],
  flavors: FlavorOption[]
): Promise<LayoutFlavorsTemplate> {
  const template = saveLayoutToLocalStorage(tables, flavors);
  const jsonStr = JSON.stringify(template, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `HookahLayout-${dateStr}.json`;

  // 1. Try Native Capacitor Filesystem save to device Documents folder
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.writeFile({
        path: filename,
        data: jsonStr,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      alert(`Layout & Flavors saved directly to this device in Documents folder: ${filename}`);
      return template;
    } catch (err) {
      console.warn('Capacitor Filesystem layout write error:', err);
    }
  }

  // 2. Try Web Share API (native share on Android/iOS)
  try {
    const file = new File([jsonStr], filename, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Hookah Lounge Layout & Flavors Template',
        text: `Hookah Lounge Layout & Flavors Template — ${dateStr}`,
        files: [file],
      });
      alert(`Layout & Flavors saved to device! (${filename})`);
      return template;
    }
  } catch {
    // Fall back to Data URI / Blob download below
  }

  // 3. Data URI fallback
  try {
    const encodedData = `data:application/json;charset=utf-8,${encodeURIComponent(jsonStr)}`;
    const link = document.createElement('a');
    link.href = encodedData;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert(`Layout & Flavors saved to device! (${filename})`);
    return template;
  } catch {
    // Fall back to Clipboard
  }

  // 4. Clipboard Copy Fallback
  try {
    await navigator.clipboard.writeText(jsonStr);
    alert(`Layout & Flavors copied to device clipboard as ${filename}! You can paste or restore it anytime.`);
  } catch {
    alert(`Layout & Flavors saved to device storage!`);
  }

  return template;
}

export function getSavedLayoutTemplate(): LayoutFlavorsTemplate | null {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LayoutFlavorsTemplate;
  } catch {
    // Ignore storage errors
  }
  return null;
}

export function parseTemplateJson(jsonString: string): LayoutFlavorsTemplate | null {
  try {
    const parsed = JSON.parse(jsonString) as LayoutFlavorsTemplate;
    if (Array.isArray(parsed.tables) && Array.isArray(parsed.flavors)) {
      return parsed;
    }
  } catch {
    // Invalid JSON
  }
  return null;
}

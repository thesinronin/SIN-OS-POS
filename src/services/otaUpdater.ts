import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Capacitor } from '@capacitor/core';

export interface OtaCheckResult {
  version: string;
  url: string;
  notes?: string;
  releasedAt: number;
}

let isChecking = false;

export async function initOtaUpdater(
  onUpdateAvailable?: (info: OtaCheckResult, applyUpdate: () => Promise<void>) => void
) {
  // Only run OTA updater inside native Capacitor environment (Android/iOS)
  if (!Capacitor.isNativePlatform()) return;

  try {
    // Notify Capgo plugin that the current web bundle loaded successfully (prevents rollback)
    await CapacitorUpdater.notifyAppReady();
  } catch (err) {
    console.warn('CapacitorUpdater.notifyAppReady error:', err);
  }

  // Auto check for update on app startup
  await checkForOtaUpdate(onUpdateAvailable);
}

export async function checkForOtaUpdate(
  onUpdateAvailable?: (info: OtaCheckResult, applyUpdate: () => Promise<void>) => void
): Promise<OtaCheckResult | null> {
  if (isChecking || !Capacitor.isNativePlatform()) return null;
  isChecking = true;

  try {
    const res = await fetch('/api/ota/check');
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) return null;

    const data = (await res.json()) as OtaCheckResult;
    if (!data || !data.version || !data.url) return null;

    // Check currently installed version
    const current = await CapacitorUpdater.current();
    if (current?.bundle?.version === data.version) {
      return null; // Already on latest version
    }

    const applyUpdate = async () => {
      try {
        const bundle = await CapacitorUpdater.download({
          version: data.version,
          url: data.url,
        });
        if (bundle) {
          await CapacitorUpdater.set({ id: bundle.id });
        }
      } catch (err) {
        console.error('Failed to apply OTA update:', err);
      }
    };

    if (onUpdateAvailable) {
      onUpdateAvailable(data, applyUpdate);
    } else {
      // Default: background download & apply
      await applyUpdate();
    }

    return data;
  } catch (err) {
    console.warn('OTA update check failed:', err);
    return null;
  } finally {
    isChecking = false;
  }
}

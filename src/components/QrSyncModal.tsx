import React, { useEffect, useRef, useState } from 'react';
import { Camera as CapCamera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Check, Image as ImageIcon, QrCode, Wifi, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface QrSyncModalProps {
  visible: boolean;
  currentServerIp: string;
  onSaveServerIp: (ip: string) => void;
  onClose: () => void;
}

export const QrSyncModal: React.FC<QrSyncModalProps> = ({
  visible,
  currentServerIp,
  onSaveServerIp,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'show' | 'scan'>('show');
  const [ipInput, setIpInput] = useState(currentServerIp);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanSuccess, setScanSuccess] = useState(false);
  const [scannedIpResult, setScannedIpResult] = useState('');

  const qrScannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (visible) {
      setIpInput(currentServerIp || window.location.host || '192.168.1.100:3000');
      setCameraError('');
      setScanSuccess(false);
      setScannedIpResult('');

      // Auto-detect server Wi-Fi IP if running on main PC
      fetch('/api/info')
        .then((res) => (res.ok ? res.json() : null))
        .then((info: { primaryIp?: string; port?: number } | null) => {
          if (info && info.primaryIp && info.primaryIp !== 'localhost' && !currentServerIp) {
            setIpInput(`${info.primaryIp}:${info.port || 3000}`);
          }
        })
        .catch(() => {});
    } else {
      stopCameraScanner();
    }
  }, [visible, currentServerIp]);

  const stopCameraScanner = async () => {
    if (qrScannerRef.current) {
      try {
        if (qrScannerRef.current.isScanning) {
          await qrScannerRef.current.stop();
        }
        qrScannerRef.current.clear();
      } catch {
        // Ignore stop errors
      }
      qrScannerRef.current = null;
    }
    setCameraActive(false);
  };

  const handleApplyIp = (ip: string) => {
    const clean = ip.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!clean) return;
    setScannedIpResult(clean);
    onSaveServerIp(clean);
    setScanSuccess(true);
    setTimeout(() => {
      stopCameraScanner();
      onClose();
    }, 1200);
  };

  const startCameraScanner = async () => {
    setCameraError('');
    setScanSuccess(false);

    // 1. Request Capacitor Android native camera permission
    if (Capacitor.isNativePlatform()) {
      try {
        await CapCamera.requestPermissions({ permissions: ['camera'] });
      } catch (e) {
        console.warn('Capacitor camera request error:', e);
      }
    }

    // 2. Initialize Html5Qrcode Scanner on container element
    try {
      await stopCameraScanner();

      const scannerContainer = document.getElementById('qr-reader-container');
      if (!scannerContainer) {
        setCameraError('Scanner element not ready. Please try again.');
        return;
      }

      const html5QrCode = new Html5Qrcode('qr-reader-container');
      qrScannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
        },
        (decodedText) => {
          // Decoded QR text handler
          try {
            const parsed = JSON.parse(decodedText) as { ip?: string; type?: string };
            if (parsed && parsed.ip) {
              handleApplyIp(parsed.ip);
            } else {
              handleApplyIp(decodedText);
            }
          } catch {
            handleApplyIp(decodedText);
          }
        },
        () => {
          // Frame decode warning (ignore)
        }
      );

      setCameraActive(true);
    } catch (err: unknown) {
      console.warn('Html5Qrcode camera error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setCameraError(
        `Camera Error: ${msg || 'Camera access denied or unavailable.'} You can enter Server IP manually or upload QR image below.`
      );
      setCameraActive(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCameraError('');
    try {
      const html5QrCode = new Html5Qrcode('qr-reader-file-temp');
      const decodedText = await html5QrCode.scanFile(file, true);
      html5QrCode.clear();

      try {
        const parsed = JSON.parse(decodedText) as { ip?: string };
        if (parsed && parsed.ip) {
          handleApplyIp(parsed.ip);
        } else {
          handleApplyIp(decodedText);
        }
      } catch {
        handleApplyIp(decodedText);
      }
    } catch {
      setCameraError('Could not read QR code from image file. Please try another image or enter IP manually.');
    }
  };

  if (!visible) return null;

  const serverUrl = ipInput.startsWith('http')
    ? ipInput
    : `http://${ipInput.includes(':') ? ipInput : `${ipInput}:3000`}`;

  const qrPayload = JSON.stringify({
    type: 'SINOS_SYNC_SERVER',
    ip: ipInput.trim(),
    url: serverUrl,
  });

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 pt-safe pb-safe sm:p-4"
      onClick={() => {
        stopCameraScanner();
        onClose();
      }}
    >
      <div
        className="modal-safe-panel flex w-full sm:max-w-md flex-col rounded-t-3xl sm:rounded-2xl border border-cyan-500/35 bg-[#0A0F1C] p-4 sm:p-5 pb-safe shadow-[0_0_50px_rgba(6,182,212,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-cyan-500/40 sm:hidden" />

        {/* Hidden temp container for image file scanner */}
        <div id="qr-reader-file-temp" className="hidden" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
          <div className="flex items-center gap-2.5">
            <Wifi className="h-5 w-5 text-cyan-400" />
            <div>
              <h2 className="text-lg font-bold text-slate-100 font-display tracking-wide">
                Wi-Fi QR Code Multi-Device Sync
              </h2>
              <p className="text-xs text-slate-400">
                Connect all phones &amp; tablets to main POS server
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCameraScanner();
              onClose();
            }}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 hover:bg-cyan-500/10 hover:text-cyan-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Segmented Tab Switcher */}
        <div className="mt-3.5 grid grid-cols-2 gap-1 rounded-xl border border-cyan-500/25 bg-[#060913] p-1">
          <button
            type="button"
            onClick={() => {
              stopCameraScanner();
              setActiveTab('show');
            }}
            className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${
              activeTab === 'show'
                ? 'bg-cyan-400 text-slate-950 cyber-glow-cyan'
                : 'text-slate-300 hover:text-cyan-200'
            }`}
          >
            <QrCode className="h-3.5 w-3.5" />
            Display QR Code
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('scan');
              setTimeout(() => startCameraScanner(), 150);
            }}
            className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${
              activeTab === 'scan'
                ? 'bg-fuchsia-500 text-white cyber-glow-magenta'
                : 'text-slate-300 hover:text-fuchsia-200'
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
            Scan QR Code
          </button>
        </div>

        {/* Tab 1: Display QR Code */}
        {activeTab === 'show' && (
          <div className="mt-4 flex flex-col items-center text-center space-y-3">
            <div className="rounded-2xl border-2 border-cyan-400/50 bg-white p-4 shadow-[0_0_30px_rgba(34,211,238,0.25)]">
              <QRCodeSVG
                value={qrPayload}
                size={210}
                level="H"
                includeMargin
              />
            </div>

            <div className="w-full space-y-1.5 rounded-xl border border-cyan-500/20 bg-[#060913] p-3 text-left">
              <span className="block text-[11px] font-semibold text-cyan-200/80">
                Main Server Host / IP Address:
              </span>
              <input
                type="text"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                placeholder="e.g. 192.168.1.100:3000"
                className="w-full min-h-[40px] rounded-lg border border-cyan-500/30 bg-[#0A0F1C] px-3 font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
              <p className="text-[10px] text-slate-400">
                Staff scan this QR code with their phone/tablet camera to sync instantly over lounge Wi-Fi.
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Scan Camera QR Code */}
        {activeTab === 'scan' && (
          <div className="mt-4 flex flex-col items-center text-center space-y-3">
            {scanSuccess ? (
              <div className="flex flex-col items-center gap-2 p-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 w-full">
                <Check className="h-12 w-12 text-emerald-400" />
                <span className="text-sm font-bold">Connected &amp; Synced Live!</span>
                <span className="font-mono text-xs text-emerald-200">{scannedIpResult}</span>
              </div>
            ) : (
              <>
                <div
                  id="qr-reader-container"
                  className="w-full aspect-square max-w-[280px] overflow-hidden rounded-2xl border-2 border-fuchsia-400/60 bg-[#060913]"
                />

                {!cameraActive && (
                  <button
                    type="button"
                    onClick={startCameraScanner}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-500 px-4 text-xs font-bold text-white hover:bg-fuchsia-400 cyber-glow-magenta"
                  >
                    <Camera className="h-4 w-4" />
                    Start Camera Scanner
                  </button>
                )}

                <label className="flex min-h-[38px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-[#060913] px-3 text-xs font-semibold text-cyan-200 hover:border-cyan-400 hover:bg-[#0E1626]">
                  <ImageIcon className="h-4 w-4 text-cyan-400" />
                  Scan QR Code Image / Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                {cameraError && (
                  <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-300 text-left leading-relaxed">
                    {cameraError}
                  </p>
                )}
              </>
            )}

            <div className="w-full space-y-2 pt-2 border-t border-cyan-500/15">
              <span className="block text-[11px] text-slate-400">
                Or enter Server IP manually:
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ipInput}
                  onChange={(e) => setIpInput(e.target.value)}
                  placeholder="192.168.1.100:3000"
                  className="flex-1 min-h-[42px] rounded-xl border border-cyan-500/30 bg-[#060913] px-3 font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleApplyIp(ipInput)}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-400 px-4 text-xs font-bold text-slate-950 hover:bg-emerald-300 cyber-glow-emerald whitespace-nowrap"
                >
                  <Check className="h-4 w-4" />
                  Connect
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

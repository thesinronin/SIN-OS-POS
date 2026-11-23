import React, { useEffect, useState } from 'react';
import { CheckCircle2, Info, Sparkles, AlertTriangle, XCircle, X } from 'lucide-react';
import { subscribeToast, type ToastMessage } from '../services/toastNotice';
import { triggerHaptic } from '../hooks/useAndroidWakeLock';

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToast((toast) => {
      triggerHaptic(10);
      setToasts((prev) => [...prev, toast]);

      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, toast.durationMs || 3200);

      return () => clearTimeout(timer);
    });

    return unsubscribe;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 w-full max-w-sm px-4 pointer-events-none">
      {toasts.map((t) => {
        const isSuccess = t.type === 'success';
        const isWarning = t.type === 'warning';
        const isError = t.type === 'error';

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full items-start gap-3 rounded-2xl border p-3.5 shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-4 duration-300 ${
              isError
                ? 'border-rose-500/40 bg-rose-950/90 text-rose-100 cyber-glow-magenta'
                : isWarning
                ? 'border-amber-500/40 bg-amber-950/90 text-amber-100'
                : 'border-cyan-400/50 bg-[#0A1022]/95 text-slate-100 cyber-glow-cyan'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {isError ? (
                <XCircle className="h-5 w-5 text-rose-400" />
              ) : isWarning ? (
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              ) : (
                <Sparkles className="h-5 w-5 text-cyan-300 animate-pulse" />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-0.5">
              <h4 className="text-xs font-bold font-display tracking-wide text-cyan-300 flex items-center gap-1.5">
                {t.title}
              </h4>
              <p className="text-xs text-slate-200 leading-snug break-words font-sans">
                {t.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="text-slate-400 hover:text-slate-100 p-0.5 shrink-0"
              aria-label="Dismiss notice"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

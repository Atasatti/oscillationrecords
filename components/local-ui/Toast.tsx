"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "info";
type ToastItem = { id: number; message: string; variant: ToastVariant };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

const VARIANT_ACCENT: Record<ToastVariant, string> = {
  success: "border-l-green-500",
  error: "border-l-red-500",
  info: "border-l-white/40",
};

const VARIANT_META: Record<
  ToastVariant,
  { Icon: React.ElementType; iconClass: string; srLabel: string }
> = {
  success: { Icon: CheckCircle2, iconClass: "text-green-400", srLabel: "Success" },
  error: { Icon: AlertCircle, iconClass: "text-red-400", srLabel: "Error" },
  info: { Icon: Info, iconClass: "text-white/70", srLabel: "Info" },
};

// Errors linger longer (and are announced assertively); success/info are brief.
const DURATION: Record<ToastVariant, number> = {
  success: 4500,
  error: 8000,
  info: 4500,
};

/**
 * One toast row, owning its own auto-dismiss timer so it can pause on hover/focus
 * (so a reader/distracted user doesn't lose the message) and resume on leave.
 */
function ToastRow({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const { id, message, variant } = toast;
  const { Icon, iconClass, srLabel } = VARIANT_META[variant];
  const isError = variant === "error";

  const timerRef = useRef<number | null>(null);
  const remainingRef = useRef(DURATION[variant]);
  const startRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    startRef.current = Date.now();
    timerRef.current = window.setTimeout(
      () => onDismiss(id),
      remainingRef.current
    );
  }, [clearTimer, id, onDismiss]);

  const pauseTimer = useCallback(() => {
    if (timerRef.current !== null) {
      remainingRef.current -= Date.now() - startRef.current;
      clearTimer();
    }
  }, [clearTimer]);

  useEffect(() => {
    startTimer();
    return clearTimer;
  }, [startTimer, clearTimer]);

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
      onFocus={pauseTimer}
      onBlur={startTimer}
      className={`player-slide-up pointer-events-auto flex items-start gap-2.5 rounded-lg border border-white/10 border-l-4 bg-[#141414] px-4 py-3 text-sm text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)] ${VARIANT_ACCENT[variant]}`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} aria-hidden />
      <p className="min-w-0 flex-1 break-words">
        <span className="sr-only">{srLabel}: </span>
        {message}
      </p>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** Minimal, dependency-free toast system (bottom-right, auto-dismiss). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message: string, variant: ToastVariant) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, variant }]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error"),
      info: (m) => push(m, "info"),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

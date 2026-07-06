"use client";

import type { Toast as ToastItem } from "@/hooks/useToast";

export function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="vc-toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`vc-toast${t.type === "error" ? " vc-toast--error" : ""}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

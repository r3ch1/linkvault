"use client";

import { AlertTriangle } from "lucide-react";

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-950 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {destructive && (
            <div className="rounded-full bg-red-500/10 p-2 text-red-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-base font-semibold">{title}</h3>
            <div className="mt-1 text-sm text-neutral-400">{message}</div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-900"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={
              destructive
                ? "rounded-md border border-red-900/40 bg-red-500/10 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/20"
                : "rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Loader2, X, Check, AlertCircle } from "lucide-react";
import { StorageBackendForm } from "./StorageBackendForm";
import { tauri } from "@/lib/tauri-bridge";
import type { StorageInit } from "@/lib/types";

const EMPTY_LOCAL: StorageInit = {
  kind: "local",
  local_path: "",
  s3: null,
  webdav: null,
};

interface MigrationReport {
  copied: number;
  skipped_existing: number;
  failed: number;
  errors: string[];
}

export function MigrationDialog({
  defaultLocalPath,
  initialSource,
  onClose,
  onDone,
}: {
  defaultLocalPath?: string;
  /** If provided, prefills the source form. Used by the smart-prompt path. */
  initialSource?: StorageInit;
  onClose: () => void;
  onDone: (report: MigrationReport) => void;
}) {
  const [source, setSource] = useState<StorageInit>(
    initialSource ?? { ...EMPTY_LOCAL, local_path: defaultLocalPath ?? "" }
  );
  const [overwrite, setOverwrite] = useState(false);
  const [phase, setPhase] = useState<
    "idle" | "counting" | "confirm" | "running" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [report, setReport] = useState<MigrationReport | null>(null);

  async function handleScan() {
    setError(null);
    setPhase("counting");
    try {
      const n = await tauri.storageCountBookmarks(source);
      setCount(n);
      setPhase(n > 0 ? "confirm" : "error");
      if (n === 0) setError("Nenhum bookmark encontrado nessa origem.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  async function handleRun() {
    setError(null);
    setPhase("running");
    try {
      const r = await tauri.storageMigrate(source, overwrite);
      setReport(r);
      setPhase("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  function handleFinish() {
    if (report) onDone(report);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-2xl rounded-lg border border-neutral-800 bg-neutral-950 p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="mb-1 text-lg font-semibold">
          Importar bookmarks de outro storage
        </h2>
        <p className="mb-4 text-xs text-neutral-500">
          Copia <code>.md</code> + <code>.meta.json</code> da origem pro storage
          ativo. Não altera a origem. Bookmarks com mesmo ID são preservados, a
          menos que &quot;sobrescrever&quot; esteja marcado.
        </p>

        {(phase === "idle" || phase === "counting" || phase === "confirm") && (
          <>
            <StorageBackendForm
              value={source}
              onChange={setSource}
              defaultLocalPath={defaultLocalPath}
              showSecret
            />

            <label className="mt-4 flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              Sobrescrever bookmarks já existentes no destino
            </label>

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-red-700/40 bg-red-500/10 p-2 text-xs text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="whitespace-pre-wrap">{error}</span>
              </div>
            )}

            {phase === "confirm" && count !== null && (
              <div className="mt-3 rounded-md border border-emerald-700/40 bg-emerald-500/10 p-2 text-xs text-emerald-200">
                Encontrados <strong>{count}</strong> bookmark(s) na origem.
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-900"
              >
                Cancelar
              </button>
              {phase !== "confirm" && (
                <button
                  onClick={handleScan}
                  disabled={phase === "counting"}
                  className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900 disabled:opacity-50"
                >
                  {phase === "counting" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Verificar origem"
                  )}
                </button>
              )}
              {phase === "confirm" && (
                <button
                  onClick={handleRun}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500"
                >
                  Importar agora
                </button>
              )}
            </div>
          </>
        )}

        {phase === "running" && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
            <p className="text-sm text-neutral-400">Copiando…</p>
          </div>
        )}

        {phase === "done" && report && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-emerald-700/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              <Check className="h-4 w-4" />
              Migração concluída.
            </div>
            <ul className="text-sm text-neutral-300">
              <li>Copiados: <strong>{report.copied}</strong></li>
              <li>
                Já existiam no destino (pulados):{" "}
                <strong>{report.skipped_existing}</strong>
              </li>
              <li>Falharam: <strong>{report.failed}</strong></li>
            </ul>
            {report.errors.length > 0 && (
              <details className="rounded-md border border-neutral-800 bg-neutral-900 p-2 text-xs text-neutral-400">
                <summary className="cursor-pointer">
                  Ver erros ({report.errors.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {report.errors.map((e, i) => (
                    <li key={i} className="break-all">
                      • {e}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex justify-end">
              <button
                onClick={handleFinish}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500"
              >
                OK
              </button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-red-700/40 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="whitespace-pre-wrap">{error}</span>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setError(null);
                  setPhase("idle");
                }}
                className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-900"
              >
                Voltar
              </button>
              <button
                onClick={onClose}
                className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-900"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Camera, Check, ClipboardPaste, Loader2, X, AlertCircle } from "lucide-react";
import { tauri } from "@/lib/tauri-bridge";
import { isMobile } from "@/lib/platform";

type ImportSummary = Awaited<ReturnType<typeof tauri.pairingImport>>;

export function PairingImportDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (summary: ImportSummary) => void;
}) {
  const [mode, setMode] = useState<"choose" | "paste" | "scanning" | "done" | "error">(
    "choose"
  );
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const mobile = isMobile();

  async function startScan() {
    setError(null);
    setMode("scanning");
    try {
      // Lazy-load the plugin so it doesn't break the desktop build.
      const mod = await import("@tauri-apps/plugin-barcode-scanner");
      const result = await mod.scan({
        windowed: false,
        formats: [mod.Format.QRCode],
      });
      const text = result?.content;
      if (!text) {
        setError("Nenhum QR code lido.");
        setMode("error");
        return;
      }
      await applyPayload(text);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setMode("error");
    }
  }

  async function applyPasted() {
    if (!pasteText.trim()) {
      setError("Cole o payload JSON.");
      setMode("error");
      return;
    }
    await applyPayload(pasteText.trim());
  }

  async function applyPayload(text: string) {
    setError(null);
    try {
      const s = await tauri.pairingImport(text);
      setSummary(s);
      setMode("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setMode("error");
    }
  }

  function handleFinish() {
    if (summary) onDone(summary);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-950 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="mb-1 text-lg font-semibold">Importar do desktop</h2>
        <p className="mb-4 text-xs text-neutral-500">
          Importa storage + chaves de IA de outro device LinkVault. Não toca
          em bookmarks — só configuração.
        </p>

        {mode === "choose" && (
          <div className="space-y-3">
            {mobile && (
              <button
                onClick={startScan}
                className="flex w-full items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900 p-3 text-left hover:border-indigo-500"
              >
                <Camera className="h-5 w-5 text-indigo-400" />
                <div>
                  <div className="text-sm font-medium">Escanear QR Code</div>
                  <div className="text-xs text-neutral-500">
                    Abre a câmera para ler o QR mostrado pelo desktop
                  </div>
                </div>
              </button>
            )}
            <button
              onClick={() => setMode("paste")}
              className="flex w-full items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900 p-3 text-left hover:border-indigo-500"
            >
              <ClipboardPaste className="h-5 w-5 text-indigo-400" />
              <div>
                <div className="text-sm font-medium">Colar payload JSON</div>
                <div className="text-xs text-neutral-500">
                  {mobile
                    ? "Alternativa caso a câmera não funcione"
                    : "No desktop você usa o botão Copiar do export e cola aqui"}
                </div>
              </div>
            </button>
          </div>
        )}

        {mode === "paste" && (
          <div className="space-y-3">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={8}
              autoFocus
              placeholder='{"v":1,"config":{...},"secrets":{...}}'
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs focus:border-indigo-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setMode("choose")}
                className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-900"
              >
                Voltar
              </button>
              <button
                onClick={applyPasted}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500"
              >
                Importar
              </button>
            </div>
          </div>
        )}

        {mode === "scanning" && (
          <div className="flex flex-col items-center gap-2 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            <p className="text-sm text-neutral-400">Aguardando QR…</p>
          </div>
        )}

        {mode === "done" && summary && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-emerald-700/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              <Check className="h-4 w-4" />
              Configuração importada.
            </div>
            <ul className="text-sm text-neutral-300">
              <li>
                Storage: <strong>{summary.storage_kind}</strong>
              </li>
              <li>
                Secrets gravados no keychain:{" "}
                <strong>{summary.secrets_imported}</strong>
              </li>
              {summary.ai_providers_with_keys.length > 0 && (
                <li>
                  Providers de IA:{" "}
                  <strong>
                    {summary.ai_providers_with_keys.join(", ")}
                  </strong>
                </li>
              )}
            </ul>
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

        {mode === "error" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-red-700/40 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="whitespace-pre-wrap break-words">{error}</span>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setError(null);
                  setMode("choose");
                }}
                className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-900"
              >
                Tentar de novo
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

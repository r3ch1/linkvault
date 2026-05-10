"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Eye, EyeOff, Loader2, X, AlertTriangle, Copy, Check } from "lucide-react";
import { tauri } from "@/lib/tauri-bridge";

const TTL_SECONDS = 60;

export function PairingExportDialog({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TTL_SECONDS);
  const [payload, setPayload] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Generate the payload + QR.
  async function generate() {
    setPhase("loading");
    setError(null);
    setReveal(false);
    setSecondsLeft(TTL_SECONDS);
    try {
      const json = await tauri.pairingExport();
      setPayload(json);
      // Wait a tick so canvasRef is available after re-render.
      requestAnimationFrame(() => {
        if (canvasRef.current) {
          QRCode.toCanvas(canvasRef.current, json, {
            errorCorrectionLevel: "M",
            margin: 1,
            scale: 6,
            color: { dark: "#0f172a", light: "#ffffff" },
          }).catch((e) => {
            setError(e instanceof Error ? e.message : String(e));
            setPhase("error");
          });
        }
      });
      setPhase("ready");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TTL countdown.
  useEffect(() => {
    if (phase !== "ready") return;
    if (secondsLeft <= 0) {
      // Expired — wipe payload + force regenerate.
      setPayload(null);
      setReveal(false);
      generate();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, secondsLeft]);

  async function handleCopy() {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error(e);
    }
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
        <h2 className="mb-1 text-lg font-semibold">Conectar Android</h2>
        <p className="mb-4 text-xs text-neutral-500">
          Mostra um QR Code com a configuração de storage e chaves de IA pra
          escanear no celular. Token expira em {TTL_SECONDS}s.
        </p>

        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-700/40 bg-amber-500/10 p-2 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Não tire screenshot.</strong> Não exiba em ambiente
            público. Esse QR contém suas chaves de API e credenciais de
            storage em texto puro.
          </span>
        </div>

        {phase === "loading" && (
          <div className="flex flex-col items-center gap-2 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            <p className="text-sm text-neutral-400">Gerando token…</p>
          </div>
        )}

        {phase === "error" && (
          <div className="rounded-md border border-red-700/40 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {phase === "ready" && (
          <>
            <div className="relative flex items-center justify-center rounded-md bg-white p-4">
              <canvas
                ref={canvasRef}
                className={
                  reveal
                    ? "transition-all duration-200"
                    : "blur-md transition-all duration-200 select-none"
                }
              />
              {!reveal && (
                <button
                  onClick={() => setReveal(true)}
                  className="absolute inset-0 m-auto flex h-12 w-44 items-center justify-center gap-2 rounded-md bg-neutral-900/95 text-sm font-medium text-neutral-100 hover:bg-neutral-900"
                >
                  <Eye className="h-4 w-4" />
                  Tap to reveal
                </button>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
              <span>
                Expira em <strong>{secondsLeft}s</strong>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setReveal(!reveal)}
                  className="flex items-center gap-1 rounded-md border border-neutral-800 px-2 py-1 hover:bg-neutral-900"
                >
                  {reveal ? (
                    <>
                      <EyeOff className="h-3 w-3" /> Ocultar
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3" /> Mostrar
                    </>
                  )}
                </button>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded-md border border-neutral-800 px-2 py-1 hover:bg-neutral-900"
                  title="Copiar payload (alternativa: colar manualmente no Android)"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> Copiar
                    </>
                  )}
                </button>
              </div>
            </div>

            <p className="mt-3 text-xs text-neutral-500">
              No Android: Configurações → Importar do desktop → escaneie este
              QR. Após sucesso, fecha esta janela.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

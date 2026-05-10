"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { PairingExportDialog } from "@/components/PairingExportDialog";
import { PairingImportDialog } from "@/components/PairingImportDialog";
import { StorageSettings } from "@/components/StorageSettings";
import { Smartphone, Download } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { tauri } from "@/lib/tauri-bridge";
import { PROVIDER_DEFAULT_MODELS, PROVIDER_LABELS } from "@/lib/ai";
import type { AiProviderId, AppConfig } from "@/lib/types";

const PROVIDERS: AiProviderId[] = ["gemini", "claude", "openai", "openrouter"];

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto (mesmo idioma do conteúdo)" },
  { value: "pt", label: "Português (Brasil)" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "日本語" },
  { value: "zh", label: "中文" },
];

export default function SettingsPage() {
  const { config, load, save } = useAppStore();
  const [draft, setDraft] = useState<AppConfig | null>(null);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    if (!config) load();
  }, [config, load]);

  useEffect(() => {
    if (config && !draft) setDraft(structuredClone(config));
  }, [config, draft]);

  if (!draft) {
    return (
      <main className="flex flex-1 items-center justify-center text-neutral-500">
        Carregando…
      </main>
    );
  }

  async function saveProviderKey(provider: AiProviderId) {
    if (!draft) return;
    const value = keyDrafts[provider]?.trim();
    if (!value) return;
    setSavingKey(provider);
    try {
      await tauri.keyringSet(provider, value);
      const next: AppConfig = {
        ...draft,
        ai: {
          ...draft.ai,
          providers: {
            ...draft.ai.providers,
            [provider]: {
              ...draft.ai.providers[provider],
              has_key: true,
              model:
                draft.ai.providers[provider]?.model ||
                PROVIDER_DEFAULT_MODELS[provider],
            },
          },
        },
      };
      await save(next);
      setDraft(next);
      setKeyDrafts({ ...keyDrafts, [provider]: "" });
      setSavedFlash(provider);
      setTimeout(() => setSavedFlash(null), 1500);
    } finally {
      setSavingKey(null);
    }
  }

  async function clearProviderKey(provider: AiProviderId) {
    if (!draft) return;
    await tauri.keyringDelete(provider);
    const next: AppConfig = {
      ...draft,
      ai: {
        ...draft.ai,
        providers: {
          ...draft.ai.providers,
          [provider]: {
            ...draft.ai.providers[provider],
            has_key: false,
          },
        },
      },
    };
    await save(next);
    setDraft(next);
  }

  function setModel(provider: AiProviderId, model: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      ai: {
        ...draft.ai,
        providers: {
          ...draft.ai.providers,
          [provider]: {
            ...(draft.ai.providers[provider] ?? {
              model: "",
              has_key: false,
            }),
            model,
          },
        },
      },
    });
  }

  async function persistDraft() {
    if (!draft) return;
    await save(draft);
  }

  return (
    <main className="flex-1">
      <Header />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Link
          href="/"
          className="mb-4 flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <h1 className="mb-6 text-2xl font-bold">Configurações</h1>

        <StorageSettings draft={draft} setDraft={setDraft} save={save} />

        <section className="mb-8 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <h2 className="mb-1 text-lg font-semibold">
            Sincronizar com outro device
          </h2>
          <p className="mb-3 text-xs text-neutral-500">
            Transfere a configuração de storage e as chaves de IA pra outro
            device LinkVault (ex: do desktop pro celular). Bookmarks são
            sincronizados automaticamente porque ambos passam a ler o mesmo
            storage. Não toca nos arquivos da origem.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900"
            >
              <Smartphone className="h-4 w-4" />
              Conectar Android (gerar QR)
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900"
            >
              <Download className="h-4 w-4" />
              Importar do desktop
            </button>
          </div>
        </section>

        {showExport && (
          <PairingExportDialog onClose={() => setShowExport(false)} />
        )}
        {showImport && (
          <PairingImportDialog
            onClose={() => setShowImport(false)}
            onDone={() => {
              // Reload config so the UI reflects the imported settings.
              void load();
            }}
          />
        )}

        <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <h2 className="mb-1 text-lg font-semibold">Provedores de IA</h2>
          <p className="mb-4 text-xs text-neutral-500">
            Chaves são guardadas no keychain do sistema operacional. Nunca são
            gravadas no <code>config.json</code>.
          </p>

          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-neutral-400">
                Provider padrão
              </label>
              <select
                value={draft.ai.default_provider}
                onChange={(e) => {
                  const next = {
                    ...draft,
                    ai: {
                      ...draft.ai,
                      default_provider: e.target.value as AiProviderId,
                    },
                  };
                  setDraft(next);
                  save(next);
                }}
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-indigo-500 focus:outline-none"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-neutral-400">
                Idioma do resumo e tags
              </label>
              <select
                value={draft.ai.summary_language || "auto"}
                onChange={(e) => {
                  const next = {
                    ...draft,
                    ai: { ...draft.ai, summary_language: e.target.value },
                  };
                  setDraft(next);
                  save(next);
                }}
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-indigo-500 focus:outline-none"
              >
                {LANGUAGE_OPTIONS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral-500">
                Em &quot;Auto&quot;, a IA mantém o idioma do conteúdo. Caso contrário, traduz.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {PROVIDERS.map((p) => {
              const cfg = draft.ai.providers[p] ?? {
                model: PROVIDER_DEFAULT_MODELS[p],
                has_key: false,
              };
              const showing = !!showKey[p];
              return (
                <div
                  key={p}
                  className="rounded-md border border-neutral-800 bg-neutral-950 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium">{PROVIDER_LABELS[p]}</span>
                    {cfg.has_key ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <Check className="h-3.5 w-3.5" />
                        chave configurada
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-500">
                        sem chave
                      </span>
                    )}
                  </div>

                  <label className="block text-xs text-neutral-500">
                    Modelo
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={cfg.model}
                      onChange={(e) => setModel(p, e.target.value)}
                      onBlur={persistDraft}
                      placeholder={PROVIDER_DEFAULT_MODELS[p]}
                      className="mt-1 flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <label className="mt-3 block text-xs text-neutral-500">
                    API Key
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type={showing ? "text" : "password"}
                      value={keyDrafts[p] ?? ""}
                      onChange={(e) =>
                        setKeyDrafts({ ...keyDrafts, [p]: e.target.value })
                      }
                      placeholder={
                        cfg.has_key
                          ? "(em uso — cole nova chave para substituir)"
                          : "cole sua chave aqui"
                      }
                      className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowKey({ ...showKey, [p]: !showing })
                      }
                      className="rounded-md border border-neutral-800 px-2 hover:bg-neutral-900"
                      title={showing ? "Ocultar" : "Mostrar"}
                    >
                      {showing ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => saveProviderKey(p)}
                      disabled={!keyDrafts[p]?.trim() || savingKey === p}
                      className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {savingKey === p ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : savedFlash === p ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        "Salvar"
                      )}
                    </button>
                    {cfg.has_key && (
                      <button
                        onClick={() => clearProviderKey(p)}
                        className="rounded-md border border-red-900/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

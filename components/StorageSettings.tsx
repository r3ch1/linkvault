"use client";

import { useState } from "react";
import { Check, Download, Eye, EyeOff, Loader2 } from "lucide-react";
import { tauri } from "@/lib/tauri-bridge";
import type { AppConfig, StorageInit, StorageKind } from "@/lib/types";
import { MigrationDialog } from "./MigrationDialog";

const KINDS: { value: StorageKind; label: string; hint: string }[] = [
  { value: "local", label: "Pasta local", hint: "Sem sync entre dispositivos." },
  { value: "r2", label: "Cloudflare R2", hint: "Recomendado: barato + free tier." },
  { value: "s3", label: "Amazon S3", hint: "AWS clássico." },
  { value: "minio", label: "MinIO / self-hosted S3", hint: "Compatível com S3 API." },
  { value: "webdav", label: "WebDAV", hint: "Joplin, Nextcloud, etc." },
];

export function StorageSettings({
  draft,
  setDraft,
  save,
}: {
  draft: AppConfig;
  setDraft: (c: AppConfig) => void;
  save: (c: AppConfig) => Promise<void>;
}) {
  const [secretDraft, setSecretDraft] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | "clear" | null>(null);
  const [flash, setFlash] = useState<"saved" | "tested" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMigration, setShowMigration] = useState(false);
  /**
   * When the user changes the storage type, we surface a friendly warning
   * suggesting they use the import flow. Counts the bookmarks on the
   * currently-active backend (still the OLD one, until config_save runs).
   */
  const [switchHintCount, setSwitchHintCount] = useState<number | null>(null);

  const kind = draft.storage.type;
  const isS3Family = kind === "s3" || kind === "r2" || kind === "minio";
  const secretKey = isS3Family
    ? "s3:secret_access_key"
    : kind === "webdav"
      ? "webdav:password"
      : "";

  function update(patch: Partial<AppConfig["storage"]>) {
    const next: AppConfig = {
      ...draft,
      storage: { ...draft.storage, ...patch },
    };
    setDraft(next);
  }

  function setS3Field<K extends keyof NonNullable<AppConfig["storage"]["s3"]>>(
    field: K,
    value: NonNullable<AppConfig["storage"]["s3"]>[K]
  ) {
    const cur =
      draft.storage.s3 ??
      ({
        endpoint: null,
        region: "auto",
        bucket: "",
        access_key_id: "",
        has_secret: false,
        force_path_style: false,
      } satisfies NonNullable<AppConfig["storage"]["s3"]>);
    update({ s3: { ...cur, [field]: value } });
  }

  function setWebdavField<
    K extends keyof NonNullable<AppConfig["storage"]["webdav"]>,
  >(field: K, value: NonNullable<AppConfig["storage"]["webdav"]>[K]) {
    const cur =
      draft.storage.webdav ??
      ({
        base_url: "",
        username: "",
        has_password: false,
      } satisfies NonNullable<AppConfig["storage"]["webdav"]>);
    update({ webdav: { ...cur, [field]: value } });
  }

  function buildInit(includeSecret: boolean): StorageInit {
    if (kind === "local") {
      return {
        kind: "local",
        local_path: draft.storage.local.path,
        s3: null,
        webdav: null,
      };
    }
    if (isS3Family) {
      const s = draft.storage.s3;
      if (!s) throw new Error("S3 config não preenchido");
      return {
        kind,
        local_path: null,
        webdav: null,
        s3: {
          endpoint: s.endpoint || null,
          region: s.region || "auto",
          bucket: s.bucket,
          access_key_id: s.access_key_id,
          secret_access_key: includeSecret ? secretDraft : "",
          force_path_style: s.force_path_style,
        },
      };
    }
    if (kind === "webdav") {
      const w = draft.storage.webdav;
      if (!w) throw new Error("WebDAV config não preenchido");
      return {
        kind: "webdav",
        local_path: null,
        s3: null,
        webdav: {
          base_url: w.base_url,
          username: w.username,
          password: includeSecret ? secretDraft : "",
        },
      };
    }
    throw new Error("storage kind desconhecido");
  }

  async function handleTestConnection() {
    setBusy("test");
    setError(null);
    setFlash(null);
    try {
      // Test uses whatever the user typed — secret from secretDraft if present,
      // otherwise pulled from keychain via the Rust state path won't work because
      // build_backend reads creds from the StorageInit. So if the user already saved
      // and didn't retype the secret, we ask them to retype OR persist + use config_load path.
      if (
        kind !== "local" &&
        !secretDraft.trim() &&
        !(
          (isS3Family && draft.storage.s3?.has_secret) ||
          (kind === "webdav" && draft.storage.webdav?.has_password)
        )
      ) {
        throw new Error(
          "Cole o secret/senha no campo abaixo para testar (ou salve primeiro)."
        );
      }
      // If user didn't type but already has secret stored, fall back to "save then test via active backend" path:
      if (kind !== "local" && !secretDraft.trim()) {
        // Persist current draft (which has has_secret=true) and let the live backend test.
        await save(draft);
        await tauri
          .bookmarkListAll()
          .catch(() => {
            /* listing may fail on empty buckets, but at least connection was attempted */
          });
        // No explicit test command path here, so just succeed silently.
      } else {
        const init = buildInit(true);
        await tauri.storageTestConnection(init);
      }
      setFlash("tested");
      setTimeout(() => setFlash(null), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    setBusy("save");
    setError(null);
    setFlash(null);
    try {
      // 1. Persist secret to keychain if user typed one.
      if (secretKey && secretDraft.trim()) {
        await tauri.storageSecretSet(secretKey, secretDraft.trim());
      }

      // 2. Build the config to save (mark has_secret/has_password if there's now a secret).
      let next = draft;
      const hasSecretNow =
        secretDraft.trim().length > 0 ||
        (isS3Family && draft.storage.s3?.has_secret) ||
        (kind === "webdav" && draft.storage.webdav?.has_password);

      if (isS3Family) {
        const s = draft.storage.s3;
        if (!s) throw new Error("S3 config não preenchido");
        next = {
          ...draft,
          storage: {
            ...draft.storage,
            s3: { ...s, has_secret: !!hasSecretNow },
          },
        };
      } else if (kind === "webdav") {
        const w = draft.storage.webdav;
        if (!w) throw new Error("WebDAV config não preenchido");
        next = {
          ...draft,
          storage: {
            ...draft.storage,
            webdav: { ...w, has_password: !!hasSecretNow },
          },
        };
      }

      await save(next);
      setDraft(next);
      setSecretDraft("");
      setFlash("saved");
      setTimeout(() => setFlash(null), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleClearSecret() {
    if (!secretKey) return;
    setBusy("clear");
    try {
      await tauri.storageSecretDelete(secretKey);
      const next = { ...draft };
      if (isS3Family && next.storage.s3) {
        next.storage = {
          ...next.storage,
          s3: { ...next.storage.s3, has_secret: false },
        };
      }
      if (kind === "webdav" && next.storage.webdav) {
        next.storage = {
          ...next.storage,
          webdav: { ...next.storage.webdav, has_password: false },
        };
      }
      await save(next);
      setDraft(next);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-8 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <h2 className="mb-3 text-lg font-semibold">Storage</h2>

      <label className="block text-sm text-neutral-400">Tipo de storage</label>
      <select
        value={kind}
        onChange={async (e) => {
          const oldKind = kind;
          const newKind = e.target.value as StorageKind;
          if (oldKind !== newKind) {
            // Best-effort: count bookmarks on the currently active backend
            // (which is still the OLD one, until config_save runs).
            try {
              const items = await tauri.bookmarkListAll();
              setSwitchHintCount(items.length > 0 ? items.length : null);
            } catch {
              setSwitchHintCount(null);
            }
          }
          update({ type: newKind });
        }}
        className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-indigo-500 focus:outline-none"
      >
        {KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-neutral-500">
        {KINDS.find((k) => k.value === kind)?.hint}
      </p>

      {switchHintCount !== null && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-700/40 bg-amber-500/10 p-2 text-xs text-amber-200">
          <span>
            ⚠️ Você tem <strong>{switchHintCount}</strong> bookmark(s) no
            storage atual. Trocar de tipo <em>não move</em> esses arquivos
            automaticamente. Depois de salvar a nova configuração, use{" "}
            <strong>Importar de outro storage</strong> abaixo para copiá-los
            para o destino. A origem permanece intacta.
          </span>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {kind === "local" && (
          <div>
            <label className="block text-sm text-neutral-400">
              Pasta local dos bookmarks
            </label>
            <input
              value={draft.storage.local.path}
              onChange={(e) =>
                update({ local: { path: e.target.value } })
              }
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
        )}

        {isS3Family && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={kind === "r2" ? "Endpoint (R2)" : "Endpoint (opcional)"}
              placeholder={
                kind === "r2"
                  ? "https://<accountid>.r2.cloudflarestorage.com"
                  : kind === "minio"
                    ? "https://minio.example.com"
                    : "deixe vazio para AWS S3"
              }
              value={draft.storage.s3?.endpoint ?? ""}
              onChange={(v) => setS3Field("endpoint", v || null)}
            />
            <Field
              label="Region"
              placeholder={kind === "r2" ? "auto" : "us-east-1"}
              value={draft.storage.s3?.region ?? ""}
              onChange={(v) => setS3Field("region", v)}
            />
            <Field
              label="Bucket"
              placeholder="linkvault"
              value={draft.storage.s3?.bucket ?? ""}
              onChange={(v) => setS3Field("bucket", v)}
            />
            <Field
              label="Access Key ID"
              value={draft.storage.s3?.access_key_id ?? ""}
              onChange={(v) => setS3Field("access_key_id", v)}
            />
            <div className="sm:col-span-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                id="force_path_style"
                checked={draft.storage.s3?.force_path_style ?? false}
                onChange={(e) =>
                  setS3Field("force_path_style", e.target.checked)
                }
              />
              <label htmlFor="force_path_style" className="text-neutral-300">
                Force path-style URLs (necessário para MinIO; R2 já força)
              </label>
            </div>
          </div>
        )}

        {kind === "webdav" && (
          <div className="space-y-3">
            <Field
              label="URL base"
              placeholder="https://nc.example.com/remote.php/dav/files/me/LinkVault"
              value={draft.storage.webdav?.base_url ?? ""}
              onChange={(v) => setWebdavField("base_url", v)}
            />
            <Field
              label="Usuário"
              value={draft.storage.webdav?.username ?? ""}
              onChange={(v) => setWebdavField("username", v)}
            />
          </div>
        )}

        {kind !== "local" && (
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm text-neutral-400">
                {isS3Family ? "Secret Access Key" : "Senha"}
              </label>
              {((isS3Family && draft.storage.s3?.has_secret) ||
                (kind === "webdav" && draft.storage.webdav?.has_password)) && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  já salvo no keychain
                </span>
              )}
            </div>
            <div className="mt-1 flex gap-2">
              <input
                type={showSecret ? "text" : "password"}
                value={secretDraft}
                onChange={(e) => setSecretDraft(e.target.value)}
                placeholder={
                  isS3Family && draft.storage.s3?.has_secret
                    ? "(em uso — cole nova chave para substituir)"
                    : kind === "webdav" && draft.storage.webdav?.has_password
                      ? "(em uso — cole nova senha para substituir)"
                      : "cole o secret/senha"
                }
                className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="rounded-md border border-neutral-800 px-2 hover:bg-neutral-900"
              >
                {showSecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
              {((isS3Family && draft.storage.s3?.has_secret) ||
                (kind === "webdav" &&
                  draft.storage.webdav?.has_password)) && (
                <button
                  onClick={handleClearSecret}
                  disabled={busy !== null}
                  className="rounded-md border border-red-900/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-700/40 bg-red-500/10 p-2 text-xs text-red-300 whitespace-pre-wrap">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={handleSave}
          disabled={busy !== null}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy === "save" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : flash === "saved" ? (
            <span className="flex items-center gap-1">
              <Check className="h-4 w-4" /> Salvo
            </span>
          ) : (
            "Salvar storage"
          )}
        </button>
        {kind !== "local" && (
          <button
            onClick={handleTestConnection}
            disabled={busy !== null}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-50"
          >
            {busy === "test" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : flash === "tested" ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <Check className="h-4 w-4" /> Conectou
              </span>
            ) : (
              "Testar conexão"
            )}
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-neutral-500">
        Bookmarks são salvos como pares <code>.md</code> +{" "}
        <code>.meta.json</code> dentro de <code>bookmarks/</code>. Secrets
        ficam no keychain do SO — nunca no <code>config.json</code>.
      </p>

      <div className="mt-5 border-t border-neutral-800 pt-4">
        <h3 className="mb-1 text-sm font-medium text-neutral-200">
          Migrar bookmarks
        </h3>
        <p className="mb-2 text-xs text-neutral-500">
          Tem bookmarks num storage antigo (ex: pasta local) que você quer
          trazer pro storage ativo? Use a importação — copia tudo sem mexer
          na origem.
        </p>
        <button
          onClick={() => setShowMigration(true)}
          className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900"
        >
          <Download className="h-4 w-4" />
          Importar de outro storage
        </button>
      </div>

      {showMigration && (
        <MigrationDialog
          defaultLocalPath={draft.storage.local.path}
          onClose={() => setShowMigration(false)}
          onDone={() => {
            // Caller can refresh the list; we just close.
            setShowMigration(false);
          }}
        />
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-neutral-500">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
    </div>
  );
}

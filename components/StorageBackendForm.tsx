"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { StorageInit, StorageKind } from "@/lib/types";

const KINDS: { value: StorageKind; label: string }[] = [
  { value: "local", label: "Pasta local" },
  { value: "r2", label: "Cloudflare R2" },
  { value: "s3", label: "Amazon S3" },
  { value: "minio", label: "MinIO / self-hosted S3" },
  { value: "webdav", label: "WebDAV" },
];

/**
 * Reusable storage-backend form. Returns the StorageInit upward via onChange.
 * Used both for the active storage settings and for the migration source picker.
 *
 * NOTE: secrets here are entered in plaintext and live only in memory until
 * the parent uses them. They are not persisted to keychain by this component.
 */
export function StorageBackendForm({
  value,
  onChange,
  defaultLocalPath,
  showSecret,
}: {
  value: StorageInit;
  onChange: (next: StorageInit) => void;
  defaultLocalPath?: string;
  showSecret?: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  const isS3Family =
    value.kind === "r2" || value.kind === "s3" || value.kind === "minio";

  function patch(next: Partial<StorageInit>) {
    onChange({ ...value, ...next });
  }

  function patchS3(next: Partial<NonNullable<StorageInit["s3"]>>) {
    const cur = value.s3 ?? {
      endpoint: null,
      region: "auto",
      bucket: "",
      access_key_id: "",
      secret_access_key: "",
      force_path_style: value.kind === "r2" || value.kind === "minio",
    };
    onChange({ ...value, s3: { ...cur, ...next } });
  }

  function patchWebdav(next: Partial<NonNullable<StorageInit["webdav"]>>) {
    const cur = value.webdav ?? {
      base_url: "",
      username: "",
      password: "",
    };
    onChange({ ...value, webdav: { ...cur, ...next } });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-neutral-500">Tipo</label>
        <select
          value={value.kind}
          onChange={(e) => {
            const k = e.target.value as StorageKind;
            patch({
              kind: k,
              local_path:
                k === "local" ? value.local_path ?? defaultLocalPath ?? "" : null,
              s3: k === "local" || k === "webdav" ? null : value.s3,
              webdav: k === "webdav" ? value.webdav : null,
            });
          }}
          className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-indigo-500 focus:outline-none"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      {value.kind === "local" && (
        <Field
          label="Pasta local"
          value={value.local_path ?? ""}
          onChange={(v) => patch({ local_path: v })}
          placeholder={defaultLocalPath}
        />
      )}

      {isS3Family && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Endpoint (opcional)"
            value={value.s3?.endpoint ?? ""}
            onChange={(v) => patchS3({ endpoint: v || null })}
            placeholder={
              value.kind === "r2"
                ? "https://<accountid>.r2.cloudflarestorage.com"
                : ""
            }
          />
          <Field
            label="Region"
            value={value.s3?.region ?? ""}
            onChange={(v) => patchS3({ region: v })}
            placeholder={value.kind === "r2" ? "auto" : "us-east-1"}
          />
          <Field
            label="Bucket"
            value={value.s3?.bucket ?? ""}
            onChange={(v) => patchS3({ bucket: v })}
          />
          <Field
            label="Access Key ID"
            value={value.s3?.access_key_id ?? ""}
            onChange={(v) => patchS3({ access_key_id: v })}
          />
          {showSecret && (
            <SecretField
              label="Secret Access Key"
              value={value.s3?.secret_access_key ?? ""}
              onChange={(v) => patchS3({ secret_access_key: v })}
              reveal={reveal}
              onToggle={() => setReveal(!reveal)}
            />
          )}
          <div className="sm:col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.s3?.force_path_style ?? false}
              onChange={(e) => patchS3({ force_path_style: e.target.checked })}
            />
            <span className="text-neutral-300">Force path-style URLs</span>
          </div>
        </div>
      )}

      {value.kind === "webdav" && (
        <div className="space-y-3">
          <Field
            label="URL base"
            value={value.webdav?.base_url ?? ""}
            onChange={(v) => patchWebdav({ base_url: v })}
            placeholder="https://nc.example.com/remote.php/dav/files/me/LinkVault"
          />
          <Field
            label="Usuário"
            value={value.webdav?.username ?? ""}
            onChange={(v) => patchWebdav({ username: v })}
          />
          {showSecret && (
            <SecretField
              label="Senha"
              value={value.webdav?.password ?? ""}
              onChange={(v) => patchWebdav({ password: v })}
              reveal={reveal}
              onToggle={() => setReveal(!reveal)}
            />
          )}
        </div>
      )}
    </div>
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

function SecretField({
  label,
  value,
  onChange,
  reveal,
  onToggle,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  reveal: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="sm:col-span-2">
      <label className="block text-xs text-neutral-500">{label}</label>
      <div className="mt-1 flex gap-2">
        <input
          type={reveal ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={onToggle}
          className="rounded-md border border-neutral-800 px-2 hover:bg-neutral-900"
        >
          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

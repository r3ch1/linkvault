"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, RefreshCw } from "lucide-react";
import { snapshot, subscribe, push, type DebugEvent } from "@/lib/debug-log";
import { tauri } from "@/lib/tauri-bridge";

export function DebugOverlay({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<DebugEvent[]>(snapshot());
  const [info, setInfo] = useState<unknown>(null);
  const [infoErr, setInfoErr] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribe(() => setEvents(snapshot()));
    return () => {
      unsub();
    };
  }, []);

  async function fetchInfo() {
    try {
      const r = await tauri.debugInfo();
      setInfo(r);
      setInfoErr(null);
    } catch (e) {
      setInfoErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    fetchInfo();
  }, []);

  function fmtTime(t: number) {
    const d = new Date(t);
    return `${d.getHours().toString().padStart(2, "0")}:${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d
      .getMilliseconds()
      .toString()
      .padStart(3, "0")}`;
  }

  function colorFor(kind: DebugEvent["kind"]) {
    if (kind === "error") return "text-red-300";
    if (kind === "invoke") return "text-indigo-300";
    if (kind === "result") return "text-emerald-300";
    return "text-neutral-300";
  }

  // Portal to <body> because the Header has `backdrop-blur`, which creates a
  // containing block for `position: fixed` children — without the portal, the
  // overlay only covers the header bar.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-xs text-neutral-200">
      <div
        className="flex items-center justify-between border-b border-neutral-800 px-3 py-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
      >
        <span className="font-semibold">debug</span>
        <div className="flex gap-2">
          <button
            onClick={() => {
              fetchInfo();
              push({ kind: "info", msg: "manual refresh" });
            }}
            className="rounded p-1 hover:bg-neutral-800"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-neutral-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 py-2 font-mono">
        <h3 className="mb-1 mt-0 text-neutral-400">debug_info</h3>
        {infoErr ? (
          <pre className="whitespace-pre-wrap text-red-300">{infoErr}</pre>
        ) : (
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(info, null, 2)}
          </pre>
        )}

        <h3 className="mb-1 mt-4 text-neutral-400">
          events ({events.length})
        </h3>
        {events.length === 0 ? (
          <p className="text-neutral-500">(vazio)</p>
        ) : (
          events
            .slice()
            .reverse()
            .map((ev, i) => (
              <div key={i} className={`mb-1 ${colorFor(ev.kind)}`}>
                <span className="text-neutral-500">{fmtTime(ev.t)}</span>{" "}
                <span className="uppercase">{ev.kind}</span>{" "}
                {ev.cmd && <span className="text-neutral-400">{ev.cmd}</span>}{" "}
                <span className="break-all">{ev.msg}</span>
              </div>
            ))
        )}
      </div>
    </div>,
    document.body,
  );
}

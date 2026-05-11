// In-app debug log buffer for the Moto E7 (no logcat available).
// Ring buffer of the most recent N events with a tiny subscribe API
// so a React overlay can render them live.

export type DebugEvent = {
  t: number;
  kind: "invoke" | "result" | "error" | "info";
  cmd?: string;
  msg: string;
};

const MAX = 200;
const buf: DebugEvent[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function push(ev: Omit<DebugEvent, "t">) {
  buf.push({ ...ev, t: Date.now() });
  while (buf.length > MAX) buf.shift();
  emit();
}

export function snapshot(): DebugEvent[] {
  return buf.slice();
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== "undefined") {
  // Catch any uncaught JS error / unhandled rejection so the overlay can show
  // them even when nothing was wrapped explicitly.
  window.addEventListener("error", (e) => {
    push({ kind: "error", msg: `window.onerror: ${e.message}` });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
    push({ kind: "error", msg: `unhandledrejection: ${reason}` });
  });
}

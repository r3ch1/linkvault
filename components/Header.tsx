"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, Plus, Settings } from "lucide-react";
import { DebugOverlay } from "./DebugOverlay";

export function Header({ onAdd }: { onAdd?: () => void }) {
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  function onLogoTap(e: React.MouseEvent) {
    // 5 taps within 1.5s opens the in-app debug overlay (no logcat on the
    // user's Moto E7, so this is how we surface diagnostic state).
    e.preventDefault();
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      setShowDebug(true);
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
    }, 1500);
  }

  return (
    <header
      className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          onClick={onLogoTap}
          className="flex items-center gap-2 font-semibold"
        >
          <Bookmark className="h-5 w-5 text-indigo-400" />
          <span>LinkVault</span>
        </Link>
        <div className="flex items-center gap-2">
          {onAdd && (
            <button
              onClick={onAdd}
              className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500 transition"
            >
              <Plus className="h-4 w-4" />
              Novo
            </button>
          )}
          <Link
            href="/settings"
            className="flex items-center gap-1.5 rounded-md border border-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-900 transition"
          >
            <Settings className="h-4 w-4" />
            Configurações
          </Link>
        </div>
      </div>
      {showDebug && <DebugOverlay onClose={() => setShowDebug(false)} />}
    </header>
  );
}

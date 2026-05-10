/**
 * Best-effort platform detection inside the Tauri WebView.
 * Returns "android" / "ios" / "desktop".
 */
export function detectPlatform(): "android" | "ios" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return "desktop";
}

export function isMobile(): boolean {
  const p = detectPlatform();
  return p === "android" || p === "ios";
}

// System bar insets on Android. The Tauri Android shell draws edge to edge, but the Android
// WebView does not report env(safe-area-inset-*), so the native MainActivity
// (src-tauri/android/MainActivity.kt) exposes the insets through a JavaScript bridge.
// They become the --android-inset-* CSS variables that tokens.css folds into --safe-*.
type Bridge = { insets(): string; setDarkBars?(dark: boolean): void };

const bridge = (): Bridge | undefined => (window as unknown as { EchoAndroid?: Bridge }).EchoAndroid;

function apply() {
  const b = bridge();
  if (!b) return;
  try {
    const i = JSON.parse(b.insets()) as Record<"top" | "right" | "bottom" | "left", number>;
    const root = document.documentElement.style;
    for (const side of ["top", "right", "bottom", "left"] as const) root.setProperty(`--android-inset-${side}`, `${Math.max(0, Number(i[side]) || 0)}px`);
  } catch {
    // A malformed answer leaves the previous insets in place.
  }
}

export function watchInsets() {
  if (!bridge()) return;
  apply();
  // The activity fires this event when the bars change (rotation, gesture vs. button navigation).
  window.addEventListener("echo-insets", apply);
  window.addEventListener("resize", apply);
}

/** Light status bar icons on dark screens (dark theme, Kids) and dark icons on light ones. */
export function setDarkSystemBars(dark: boolean) {
  try {
    bridge()?.setDarkBars?.(dark);
  } catch {
    // Older shells have no such method.
  }
}

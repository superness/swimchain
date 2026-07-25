/**
 * Close-interception via the Tauri v2 GLOBAL (`window.__TAURI__`, injected by
 * `withGlobalTauri: true`) — never a bare `@tauri-apps/api` import, which is
 * not in this package's deps and breaks the Vite build (the documented trap
 * in nodeRpc.ts's resolveInvoke).
 *
 * Tauri's JS `onCloseRequested` contract: registering ANY close-requested
 * listener makes the runtime defer the close to JS — after the handler runs,
 * the window is destroyed unless `preventDefault()` was called. So the
 * handler below either prevents (handing control to the quit prompt) or does
 * nothing (and the runtime destroys, firing Rust's `Destroyed` handler, which
 * stops the node sidecar). Requires the `core:default` +
 * `core:window:allow-destroy` permissions (src-tauri/capabilities/
 * default.json); if the permission plumbing ever fails, every path here
 * degrades to a no-op and closing behaves exactly as before this feature.
 * In a plain browser (dev), both exports are no-ops.
 */

interface CloseRequestedEvent {
  preventDefault(): void;
}
interface TauriWindowHandle {
  onCloseRequested(handler: (e: CloseRequestedEvent) => void): Promise<() => void>;
  destroy(): Promise<void>;
}

function currentWindow(): TauriWindowHandle | null {
  const w = window as {
    __TAURI__?: { window?: { getCurrentWindow?: () => TauriWindowHandle } };
  };
  try {
    return w.__TAURI__?.window?.getCurrentWindow?.() ?? null;
  } catch {
    return null;
  }
}

export function interceptClose(shouldIntercept: () => boolean, onIntercept: () => void): void {
  const win = currentWindow();
  if (!win) return;
  void win
    .onCloseRequested((e) => {
      if (shouldIntercept()) {
        e.preventDefault();
        onIntercept();
      }
    })
    .catch(() => {
      /* permission denied or API absent — close behaves exactly as before */
    });
}

export function destroyWindow(): void {
  const win = currentWindow();
  if (!win) return;
  void win.destroy().catch(() => {
    /* nothing to do — worst case the window simply stays open */
  });
}

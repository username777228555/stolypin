/**
 * Resilient lazy-route loader & Vite stale-chunk recovery.
 * Prevents `TypeError: Failed to fetch dynamically imported module` (e.g. after a Vite dev server
 * restart, dependency re-optimization 504, or a freshly deployed bundle) from stranding users on
 * an unrecoverable raw error screen.
 */

const RELOAD_STAMP_KEY = 'stolypin-chunk-reload-ts';
const RELOAD_COOLDOWN_MS = 15_000;

const DYNAMIC_IMPORT_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\d\w-]+ failed|Outdated Optimize Dep/i;

export function isDynamicImportError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return DYNAMIC_IMPORT_RE.test(msg);
}

export function canAutoReload(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!storage) return false;
  try {
    const prev = Number(storage.getItem(RELOAD_STAMP_KEY) ?? '0');
    if (Number.isFinite(prev) && now - prev < RELOAD_COOLDOWN_MS) return false;
    storage.setItem(RELOAD_STAMP_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

export function triggerSafeReload(): boolean {
  if (typeof window === 'undefined') return false;
  if (!canAutoReload(window.sessionStorage)) return false;
  window.location.reload();
  return true;
}

export interface LoadRetryOptions {
  retries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Called once retries are exhausted on a dynamic import error; return true if recovery (e.g. reload) started. */
  onStaleChunk?: () => boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Invokes a lazy route loader with bounded retries for transient dynamic import failures.
 * Non-import errors fail immediately without pointless retries.
 */
export async function loadRouteWithRetry<T>(
  loader: () => Promise<T>,
  opts: LoadRetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 250;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await loader();
    } catch (err) {
      lastErr = err;
      if (!isDynamicImportError(err)) throw err;
      if (attempt < retries) {
        await sleep(baseDelayMs * (attempt + 1));
      }
    }
  }

  if (opts.onStaleChunk?.()) {
    // Keep the await block pending briefly while the browser reloads cleanly instead of flashing an error.
    await sleep(4000);
  }
  throw lastErr;
}

export function formatRouteError(err: unknown): {
  title: string;
  message: string;
  canReload: boolean;
} {
  if (isDynamicImportError(err)) {
    return {
      title: 'Не удалось загрузить экран',
      message: 'Похоже, приложение обновилось или на секунду пропала связь. Нажмите «Обновить страницу», чтобы продолжить.',
      canReload: true,
    };
  }
  return {
    title: 'Не удалось открыть страницу',
    message: err instanceof Error && err.message ? err.message : 'Произошла непредвиденная ошибка. Попробуйте обновить экран.',
    canReload: true,
  };
}

/** Installs a global listener for Vite preload/chunk errors with loop protection. */
export function installChunkErrorRecovery(): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    event.preventDefault();
    triggerSafeReload();
  };
  window.addEventListener('vite:preloadError', handler);
  return () => window.removeEventListener('vite:preloadError', handler);
}

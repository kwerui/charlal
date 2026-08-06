'use client';

const NATIVE_HISTORY_INTENT_KEY = 'charlal-native-history-traversal';
const NATIVE_HISTORY_INTENT_MAX_AGE_MS = 5000;
const ACCOUNT_SCROLL_DIAGNOSTICS_KEY = 'charlal-account-scroll-diagnostics';

type StoredNativeHistoryIntent = {
  traversedAt: number;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function isAccountScrollDiagnosticsEnabled(): boolean {
  if (process.env.NODE_ENV === 'production' || !isBrowser()) {
    return false;
  }

  try {
    return (
      window.sessionStorage.getItem(ACCOUNT_SCROLL_DIAGNOSTICS_KEY) === '1' ||
      window.localStorage.getItem(ACCOUNT_SCROLL_DIAGNOSTICS_KEY) === '1'
    );
  } catch {
    return false;
  }
}

function logAccountScrollDiagnostic(message: string, details?: Record<string, unknown>): void {
  if (!isAccountScrollDiagnosticsEnabled()) {
    return;
  }

  console.debug('[Account native scroll]', message, details || {});
}

function readNativeHistoryIntent(): StoredNativeHistoryIntent | undefined {
  try {
    const storedValue = window.sessionStorage.getItem(NATIVE_HISTORY_INTENT_KEY);

    return storedValue ? (JSON.parse(storedValue) as StoredNativeHistoryIntent) : undefined;
  } catch {
    return undefined;
  }
}

export function recordNativeHistoryTraversalIntent(): void {
  if (!isBrowser()) {
    return;
  }

  const intent: StoredNativeHistoryIntent = {
    traversedAt: Date.now(),
  };

  try {
    window.sessionStorage.setItem(NATIVE_HISTORY_INTENT_KEY, JSON.stringify(intent));
    logAccountScrollDiagnostic('popstate fired; native history intent stored', intent);
  } catch {
    logAccountScrollDiagnostic('popstate fired; native history intent could not be stored');
  }
}

export function hasFreshNativeHistoryTraversalIntent(): boolean {
  if (!isBrowser()) {
    return false;
  }

  const intent = readNativeHistoryIntent();

  if (!intent || Date.now() - intent.traversedAt > NATIVE_HISTORY_INTENT_MAX_AGE_MS) {
    logAccountScrollDiagnostic('native history intent missing or stale', {
      foundIntent: Boolean(intent),
      ageMs: intent ? Date.now() - intent.traversedAt : undefined,
    });
    window.sessionStorage.removeItem(NATIVE_HISTORY_INTENT_KEY);
    return false;
  }

  logAccountScrollDiagnostic('fresh native history intent found', {
    ageMs: Date.now() - intent.traversedAt,
  });
  return true;
}

export function clearNativeHistoryTraversalIntent(): void {
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.removeItem(NATIVE_HISTORY_INTENT_KEY);
  logAccountScrollDiagnostic('native history intent cleared');
}

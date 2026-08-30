import { takeLocaleHistoryNormalizationRedirect } from '@/i18n/localeHistory';
import { recordNativeHistoryTraversalIntent } from '@/lib/nativeHistoryIntentStorage';
import { requestResultsScrollRestoreAfterNativeTraversal } from '@/lib/resultsScrollStorage';

declare global {
  interface Window {
    __charlalNativeHistoryPopstateHandler?: (
      event: PopStateEvent
    ) => void;

    __charlalDocumentInstanceId?: string;
  }
}

if (!window.__charlalDocumentInstanceId) {
  window.__charlalDocumentInstanceId =
    crypto.randomUUID();
}

const existingHandler =
  window.__charlalNativeHistoryPopstateHandler;

if (existingHandler) {
  window.removeEventListener(
    'popstate',
    existingHandler,
    true
  );
}

function handleNativeHistoryTraversal(): void {
  recordNativeHistoryTraversalIntent();

  const currentHref =
    `${window.location.pathname}${window.location.search}${window.location.hash}`;

  const redirectHref =
    takeLocaleHistoryNormalizationRedirect(
      currentHref,
      true
    );

  if (redirectHref) {
    requestResultsScrollRestoreAfterNativeTraversal(
      redirectHref
    );

    window.location.replace(redirectHref);
  }
}

// IMPORTANT: these stay OUTSIDE the function.
window.__charlalNativeHistoryPopstateHandler =
  handleNativeHistoryTraversal;

window.addEventListener(
  'popstate',
  handleNativeHistoryTraversal,
  true
);


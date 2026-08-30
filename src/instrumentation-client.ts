import { takeLocaleHistoryNormalizationRedirect } from '@/i18n/localeHistory';
import { recordNativeHistoryTraversalIntent } from '@/lib/nativeHistoryIntentStorage';

declare global {
  interface Window {
    __charlalNativeHistoryPopstateHandler?: (
      event: PopStateEvent
    ) => void;
  }
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
    window.location.replace(redirectHref);
  }
}

window.__charlalNativeHistoryPopstateHandler =
  handleNativeHistoryTraversal;

window.addEventListener(
  'popstate',
  handleNativeHistoryTraversal,
  true
);
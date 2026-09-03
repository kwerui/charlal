import { getNativeHistoryLocaleCorrectionHref } from '@/i18n/localeHistory';
import { recordNativeHistoryTraversalIntent } from '@/lib/nativeHistoryIntentStorage';
import { requestResultsScrollRestoreAfterNativeTraversal } from '@/lib/resultsScrollStorage';

declare global {
  interface Window {
    __charlalNativeHistoryPopstateHandler?: (
      event: PopStateEvent
    ) => void;

    __charlalNativeHistoryPageShowHandler?: (
      event: PageTransitionEvent
    ) => void;

    __charlalDocumentInstanceId?: string;

    __charlalInitialBackForwardCheckDone?: boolean;
  }
}

if (!window.__charlalDocumentInstanceId) {
  window.__charlalDocumentInstanceId =
    crypto.randomUUID();
}

let correctionInProgress = false;

function correctNativeHistoryLocaleIfNeeded(): void {
  if (correctionInProgress) {
    return;
  }

  const currentHref =
    `${window.location.pathname}${window.location.search}${window.location.hash}`;

  const redirectHref =
    getNativeHistoryLocaleCorrectionHref(
      currentHref
    );

  if (!redirectHref) {
    return;
  }

  correctionInProgress = true;

  requestResultsScrollRestoreAfterNativeTraversal(
    redirectHref
  );

  window.location.replace(redirectHref);
}

function handleNativeHistoryTraversal(): void {
  recordNativeHistoryTraversalIntent();

  correctNativeHistoryLocaleIfNeeded();
}

function handleNativeHistoryPageShow(
  event: PageTransitionEvent
): void {
  if (!event.persisted) {
    return;
  }

  recordNativeHistoryTraversalIntent();

  correctNativeHistoryLocaleIfNeeded();
}

function isBackForwardDocumentNavigation(): boolean {
  const navigationEntry =
    performance.getEntriesByType(
      'navigation'
    )[0] as
      | PerformanceNavigationTiming
      | undefined;

  return navigationEntry?.type === 'back_forward';
}

/*
 * HMR can execute this module again in development.
 * Remove our previous document listeners before
 * registering the current versions.
 */
const existingPopstateHandler =
  window.__charlalNativeHistoryPopstateHandler;

if (existingPopstateHandler) {
  window.removeEventListener(
    'popstate',
    existingPopstateHandler,
    true
  );
}

const existingPageShowHandler =
  window.__charlalNativeHistoryPageShowHandler;

if (existingPageShowHandler) {
  window.removeEventListener(
    'pageshow',
    existingPageShowHandler
  );
}

window.__charlalNativeHistoryPopstateHandler =
  handleNativeHistoryTraversal;

window.__charlalNativeHistoryPageShowHandler =
  handleNativeHistoryPageShow;

window.addEventListener(
  'popstate',
  handleNativeHistoryTraversal,
  true
);

window.addEventListener(
  'pageshow',
  handleNativeHistoryPageShow
);

/*
 * A cross-document Back/Forward navigation is not
 * guaranteed to restore the document from BFCache.
 *
 * When the browser loads a fresh document instead,
 * pageshow.persisted is false, but the Navigation
 * Timing entry identifies it as a back_forward load.
 *
 * Run this once per document. The window flag avoids
 * repeating it when this module is re-evaluated by
 * development HMR.
 */
if (
  !window.__charlalInitialBackForwardCheckDone
) {
  window.__charlalInitialBackForwardCheckDone =
    true;

  if (isBackForwardDocumentNavigation()) {
    recordNativeHistoryTraversalIntent();

    correctNativeHistoryLocaleIfNeeded();
  }
}
'use client';

import type { RefObject } from 'react';
import { useLayoutEffect } from 'react';
import {
  clearNativeHistoryTraversalIntent,
  hasFreshNativeHistoryTraversalIntent,
} from '@/lib/nativeHistoryIntentStorage';
import {
  getSavedResultsScrollPosition,
  hasFreshResultsScrollRestoreIntent,
  type SavedResultsScrollPosition,
} from '@/lib/resultsScrollStorage';

const ACCOUNT_RESULTS_HREF = '/account';
const MAX_LAYOUT_SETTLE_WAIT_MS = 750;
const STABLE_LAYOUT_WAIT_MS = 80;
const ACCOUNT_SCROLL_DIAGNOSTICS_KEY = 'charlal-account-scroll-diagnostics';

type Props = {
  accountReady: boolean;
  canHoldVisualRestoration: boolean;
  contentRef: RefObject<HTMLElement | null>;
};

function isExactAccountUrl(): boolean {
  return (
    window.location.pathname === ACCOUNT_RESULTS_HREF &&
    window.location.search === '' &&
    window.location.hash === ''
  );
}

function getMaximumScrollY(): number {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

function getAccountPageElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.account-page');
}

function isAccountScrollDiagnosticsEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
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

function clampScrollY(scrollY: number, maximumScrollY: number): number {
  return Math.min(Math.max(0, scrollY), maximumScrollY);
}

function getSavedScrollRatio(savedPosition: SavedResultsScrollPosition): number | undefined {
  if (savedPosition.maximumScrollY <= 0) {
    return undefined;
  }

  return savedPosition.scrollY / savedPosition.maximumScrollY;
}

function selectRestorationTarget(
  savedPosition: SavedResultsScrollPosition,
  currentMaximumScrollY: number
): {
  strategy: 'exact' | 'bottom' | 'proportional' | 'clamped';
  targetScrollY: number;
  savedScrollRatio: number | undefined;
} {
  const savedScrollRatio = getSavedScrollRatio(savedPosition);

  if (savedPosition.scrollY <= currentMaximumScrollY) {
    return {
      strategy: 'exact',
      targetScrollY: clampScrollY(savedPosition.scrollY, currentMaximumScrollY),
      savedScrollRatio,
    };
  }

  if (savedPosition.nearBottom) {
    return {
      strategy: 'bottom',
      targetScrollY: currentMaximumScrollY,
      savedScrollRatio,
    };
  }

  if (savedScrollRatio !== undefined) {
    return {
      strategy: 'proportional',
      targetScrollY: clampScrollY(
        savedScrollRatio * currentMaximumScrollY,
        currentMaximumScrollY
      ),
      savedScrollRatio,
    };
  }

  return {
    strategy: 'clamped',
    targetScrollY: clampScrollY(savedPosition.scrollY, currentMaximumScrollY),
    savedScrollRatio,
  };
}

function logAccountScrollDiagnostic(message: string, details?: Record<string, unknown>): void {
  if (!isAccountScrollDiagnosticsEnabled()) {
    return;
  }

  console.debug('[Account native scroll]', message, details || {});
}

function activateVisualRestoration(startedAt: number): void {
  const accountPageElement = getAccountPageElement();

  if (!accountPageElement) {
    logAccountScrollDiagnostic('restoring visual state skipped: Account page not found');
    return;
  }

  if (accountPageElement.dataset.accountNativeRestoring === 'true') {
    return;
  }

  accountPageElement.dataset.accountNativeRestoring = 'true';
  accountPageElement.setAttribute('aria-busy', 'true');
  logAccountScrollDiagnostic('restoring visual state activated', {
    elapsedMs: Date.now() - startedAt,
  });
  logAccountScrollDiagnostic('Account content hidden');
}

function deactivateVisualRestoration(startedAt: number): void {
  const accountPageElement = getAccountPageElement();

  if (!accountPageElement) {
    return;
  }

  if (accountPageElement.dataset.accountNativeRestoring !== 'true') {
    return;
  }

  delete accountPageElement.dataset.accountNativeRestoring;
  accountPageElement.removeAttribute('aria-busy');
  logAccountScrollDiagnostic('Account content revealed', {
    elapsedMs: Date.now() - startedAt,
  });
}

export default function AccountNativeHistoryRestorer({
  accountReady,
  canHoldVisualRestoration,
  contentRef,
}: Props) {
  useLayoutEffect(() => {
    const mountedAt = Date.now();
    const foundFreshIntent = hasFreshNativeHistoryTraversalIntent();
    const exactAccountUrl = isExactAccountUrl();
    const customBackIntent = hasFreshResultsScrollRestoreIntent(ACCOUNT_RESULTS_HREF);
    const savedPosition = getSavedResultsScrollPosition(ACCOUNT_RESULTS_HREF);

    logAccountScrollDiagnostic('restorer evaluated', {
      foundFreshIntent,
      exactAccountUrl,
      accountReady,
      canHoldVisualRestoration,
      customBackIntent,
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      availableScrollY: getMaximumScrollY(),
      savedScrollY: savedPosition?.scrollY,
      savedMaximumScroll: savedPosition?.maximumScrollY,
    });

    if (!foundFreshIntent) {
      logAccountScrollDiagnostic('restoration skipped: no fresh native history intent');
      deactivateVisualRestoration(mountedAt);
      return undefined;
    }

    if (!exactAccountUrl) {
      logAccountScrollDiagnostic('restoration skipped: current URL is not exactly /account');
      deactivateVisualRestoration(mountedAt);
      return undefined;
    }

    if (customBackIntent) {
      logAccountScrollDiagnostic('restoration skipped: custom Back intent owns restoration');
      deactivateVisualRestoration(mountedAt);
      return undefined;
    }

    if (!canHoldVisualRestoration) {
      logAccountScrollDiagnostic('restoration skipped: Account is not authenticated for visual hold');
      deactivateVisualRestoration(mountedAt);
      return undefined;
    }

    if (!savedPosition) {
      logAccountScrollDiagnostic('restoration skipped: no saved /account scroll position');
      deactivateVisualRestoration(mountedAt);
      return undefined;
    }

    activateVisualRestoration(mountedAt);

    if (!accountReady) {
      logAccountScrollDiagnostic('restoration skipped: Account is not ready yet', {
        accountReady,
      });
      return () => {
        deactivateVisualRestoration(mountedAt);
      };
    }

    const savedAccountPosition = savedPosition;
    let frameId = 0;
    let timeoutId = 0;
    let restored = false;
    const startedAt = Date.now();
    let lastMaximumScrollY = getMaximumScrollY();
    let lastLayoutChangeAt = startedAt;

    function cleanupObserver(observer: ResizeObserver | undefined): void {
      observer?.disconnect();
    }

    function restoreWhenSettled(observer?: ResizeObserver): void {
      if (restored || !hasFreshNativeHistoryTraversalIntent() || !isExactAccountUrl()) {
        logAccountScrollDiagnostic('restoration stopped before scroll', {
          restored,
          foundFreshIntent: hasFreshNativeHistoryTraversalIntent(),
          exactAccountUrl: isExactAccountUrl(),
        });
        deactivateVisualRestoration(mountedAt);
        cleanupObserver(observer);
        return;
      }

      const currentMaximumScrollY = getMaximumScrollY();

      if (currentMaximumScrollY !== lastMaximumScrollY) {
        lastMaximumScrollY = currentMaximumScrollY;
        lastLayoutChangeAt = Date.now();
      }

      const elapsedMs = Date.now() - startedAt;
      const stableForMs = Date.now() - lastLayoutChangeAt;

      if (stableForMs >= STABLE_LAYOUT_WAIT_MS || elapsedMs >= MAX_LAYOUT_SETTLE_WAIT_MS) {
        const selectedTarget = selectRestorationTarget(
          savedAccountPosition,
          currentMaximumScrollY
        );

        restored = true;
        window.scrollTo({ top: selectedTarget.targetScrollY, left: 0, behavior: 'auto' });
        window.clearTimeout(timeoutId);
        logAccountScrollDiagnostic('Account scroll restored from native history intent', {
          savedScrollY: savedAccountPosition.scrollY,
          savedMaximumScroll: savedAccountPosition.maximumScrollY,
          currentMaximumScroll: currentMaximumScrollY,
          savedScrollRatio: selectedTarget.savedScrollRatio,
          nearBottom: savedAccountPosition.nearBottom,
          strategy: selectedTarget.strategy,
          targetScrollY: selectedTarget.targetScrollY,
        });
        frameId = window.requestAnimationFrame(() => {
          logAccountScrollDiagnostic('Account scroll after restoration', {
            actualScrollY: window.scrollY,
          });
          clearNativeHistoryTraversalIntent();
          logAccountScrollDiagnostic('restoration completed', {
            elapsedMs: Date.now() - mountedAt,
          });
          deactivateVisualRestoration(mountedAt);
        });
        cleanupObserver(observer);
        return;
      }

      logAccountScrollDiagnostic('waiting for Account layout to settle', {
        savedScrollY: savedAccountPosition.scrollY,
        savedMaximumScroll: savedAccountPosition.maximumScrollY,
        currentMaximumScroll: currentMaximumScrollY,
        savedScrollRatio: getSavedScrollRatio(savedAccountPosition),
        nearBottom: savedAccountPosition.nearBottom,
        stableForMs,
        elapsedMs,
      });
      frameId = window.requestAnimationFrame(() => restoreWhenSettled(observer));
    }

    let resizeObserver: ResizeObserver | undefined;

    if (typeof ResizeObserver !== 'undefined' && contentRef.current) {
      resizeObserver = new ResizeObserver(() => {
        lastLayoutChangeAt = Date.now();
        restoreWhenSettled(resizeObserver);
      });
    }

    resizeObserver?.observe(contentRef.current as HTMLElement);
    frameId = window.requestAnimationFrame(() => restoreWhenSettled(resizeObserver));
    timeoutId = window.setTimeout(() => {
      restoreWhenSettled(resizeObserver);
    }, MAX_LAYOUT_SETTLE_WAIT_MS);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
      cleanupObserver(resizeObserver);
      deactivateVisualRestoration(mountedAt);
    };
  }, [accountReady, canHoldVisualRestoration, contentRef]);

  return null;
}

'use client';

import { useEffect, useLayoutEffect } from 'react';
import {
  saveAccountRefreshScrollPosition,
  takeAccountRefreshScrollPosition,
} from '@/lib/accountRefreshScrollStorage';
import { hasFreshNativeHistoryTraversalIntent } from '@/lib/nativeHistoryIntentStorage';
import { hasFreshResultsScrollRestoreIntent } from '@/lib/resultsScrollStorage';

type Props = {
  ready: boolean;
};

export default function AccountRefreshScrollManager({ ready }: Props) {
  useEffect(() => {
    function handlePageExit(): void {
      saveAccountRefreshScrollPosition();
    }

    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);

    return () => {
      window.removeEventListener('pagehide', handlePageExit);
      window.removeEventListener('beforeunload', handlePageExit);
    };
  }, []);

  useLayoutEffect(() => {
    if (!ready) {
      return undefined;
    }

    if (
      hasFreshNativeHistoryTraversalIntent() ||
      hasFreshResultsScrollRestoreIntent('/account')
    ) {
      return undefined;
    }

    const scrollY = takeAccountRefreshScrollPosition();

    if (scrollY === undefined) {
      return undefined;
    }

    window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    const firstFrameId = window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    });
    const secondFrameId = window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      window.cancelAnimationFrame(secondFrameId);
    };
  }, [ready]);

  return null;
}

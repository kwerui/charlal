'use client';

import { useLayoutEffect } from 'react';
import {
  completeResultsScrollRestore,
  peekResultsScrollRestorePosition,
} from '@/lib/resultsScrollStorage';

type Props = {
  resultsHref: string;
};

const MAX_RESTORE_MS = 3000;
const SCROLL_TOLERANCE_PX = 1;

function getMaximumScrollY(): number {
  return Math.max(
    0,
    document.documentElement.scrollHeight -
      window.innerHeight
  );
}

export default function ResultsScrollRestorer({
  resultsHref,
}: Props) {
  useLayoutEffect(() => {
    const startedAt = performance.now();

    let frameId = 0;
    let cancelled = false;

    function restore(): void {
      if (cancelled) {
        return;
      }

      const savedPosition =
        peekResultsScrollRestorePosition(
          resultsHref
        );

      if (!savedPosition) {
        return;
      }

      const maximumScrollY =
        getMaximumScrollY();

      let targetScrollY: number;

      if (savedPosition.nearBottom) {
        /*
         * Preserve "at the bottom" semantically even when
         * translated/responsive content changes page height.
         */
        targetScrollY = maximumScrollY;
      } else if (
        savedPosition.maximumScrollY > 0
      ) {
        /*
         * Preserve approximately the same relative position
         * when the destination page's height differs.
         */
        const scrollRatio =
          savedPosition.scrollY /
          savedPosition.maximumScrollY;

        targetScrollY = Math.min(
          maximumScrollY,
          Math.max(
            0,
            scrollRatio * maximumScrollY
          )
        );
      } else {
        targetScrollY = Math.min(
          savedPosition.scrollY,
          maximumScrollY
        );
      }

      window.scrollTo({
        top: targetScrollY,
        left: 0,
        behavior: 'auto',
      });

      if (
        Math.abs(
          window.scrollY - targetScrollY
        ) <= SCROLL_TOLERANCE_PX
      ) {
        completeResultsScrollRestore(
          resultsHref
        );

        return;
      }

      if (
        performance.now() - startedAt <
        MAX_RESTORE_MS
      ) {
        frameId =
          window.requestAnimationFrame(
            restore
          );
      }
    }

    frameId =
      window.requestAnimationFrame(
        restore
      );

    return () => {
      cancelled = true;

      window.cancelAnimationFrame(
        frameId
      );
    };
  }, [resultsHref]);

  return null;
}
'use client';

import { useLayoutEffect } from 'react';
import { takeResultsScrollPosition } from '@/lib/resultsScrollStorage';

type Props = {
  resultsHref: string;
};

export default function ResultsScrollRestorer({ resultsHref }: Props) {
  useLayoutEffect(() => {
    const scrollY = takeResultsScrollPosition(resultsHref);

    if (scrollY === undefined) {
      return;
    }

    window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    const frameId = window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [resultsHref]);

  return null;
}

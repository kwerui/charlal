'use client';

import { useEffect } from 'react';
import { recordNativeHistoryTraversalIntent } from '@/lib/nativeHistoryIntentStorage';

export default function NativeHistoryIntentMarker() {
  useEffect(() => {
    function handlePopState(): void {
      recordNativeHistoryTraversalIntent();
    }

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  return null;
}

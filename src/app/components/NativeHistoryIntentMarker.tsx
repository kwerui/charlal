'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { takeLocaleHistoryNormalizationRedirect } from '@/i18n/localeHistory';
import {
  hasFreshNativeHistoryTraversalIntent,
  recordNativeHistoryTraversalIntent,
} from '@/lib/nativeHistoryIntentStorage';

export default function NativeHistoryIntentMarker() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function handlePopState(): void {
      recordNativeHistoryTraversalIntent();
    }

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (!hasFreshNativeHistoryTraversalIntent()) {
      return;
    }

    const currentHref =
      `${pathname}${window.location.search}${window.location.hash}`;

    const redirectHref = takeLocaleHistoryNormalizationRedirect(
      currentHref,
      true
    );

    if (redirectHref) {
      router.replace(redirectHref, { scroll: false });
    }
  }, [pathname, router]);

  return null;
}
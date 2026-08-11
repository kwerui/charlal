'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { shouldRefreshForListingMutation } from '@/lib/listingMutationRefreshStorage';

type Props = {
  listingIds: string[];
};

export default function ListingMutationRefreshBoundary({
  listingIds,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.toString();
  const currentHref = currentSearch ? `${pathname}?${currentSearch}` : pathname;

  useEffect(() => {
    if (listingIds.length === 0 || pathname.includes('/edit')) {
      return;
    }

    if (shouldRefreshForListingMutation(listingIds, currentHref)) {
      router.refresh();
    }
  }, [currentHref, listingIds, pathname, router]);

  return null;
}

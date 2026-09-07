import 'server-only';

import {
  revalidateLocalizedPath,
  revalidateLocalizedRoutePattern,
} from '@/i18n/revalidate';

type ListingMutationRevalidationInput = {
  listingId: string;
};

export function revalidateListingMutationRoutes({
  listingId,
}: ListingMutationRevalidationInput): void {
  const safeListingId = listingId.trim();

  if (!safeListingId || /^\d+$/.test(safeListingId)) {
    return;
  }

  revalidateLocalizedPath(`/listing/${safeListingId}`);
  revalidateLocalizedPath('/');
  revalidateLocalizedPath('/account');
  revalidateLocalizedPath('/search');
  revalidateLocalizedRoutePattern('/category/[slug]', 'page');
  revalidateLocalizedRoutePattern('/category/[slug]/[subcategory]', 'page');
  revalidateLocalizedRoutePattern('/seller/[slug]', 'page');
}

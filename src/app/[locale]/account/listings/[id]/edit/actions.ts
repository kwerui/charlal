'use server';

import {
  revalidateLocalizedPath,
  revalidateLocalizedRoutePattern,
} from '@/i18n/revalidate';

type EditedListingRevalidationInput = {
  listingId: string;
};

export async function revalidateListingMutationRoutes({
  listingId,
}: EditedListingRevalidationInput): Promise<void> {
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

export async function revalidateEditedListingRoutes(
  input: EditedListingRevalidationInput
): Promise<void> {
  await revalidateListingMutationRoutes(input);
}

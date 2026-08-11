'use server';

import { revalidatePath } from 'next/cache';

type EditedListingRevalidationInput = {
  listingId: string;
};

export async function revalidateEditedListingRoutes({
  listingId,
}: EditedListingRevalidationInput): Promise<void> {
  const safeListingId = listingId.trim();

  if (!safeListingId || /^\d+$/.test(safeListingId)) {
    return;
  }

  revalidatePath(`/listing/${safeListingId}`);
  revalidatePath('/');
  revalidatePath('/account');
  revalidatePath('/search');
  revalidatePath('/category/[slug]/[subcategory]', 'page');
  revalidatePath('/seller/[slug]', 'page');
}

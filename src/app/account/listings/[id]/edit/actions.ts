'use server';

import { revalidatePath } from 'next/cache';

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

  revalidatePath(`/listing/${safeListingId}`);
  revalidatePath('/');
  revalidatePath('/account');
  revalidatePath('/search');
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/category/[slug]/[subcategory]', 'page');
  revalidatePath('/seller/[slug]', 'page');
}

export async function revalidateEditedListingRoutes(
  input: EditedListingRevalidationInput
): Promise<void> {
  await revalidateListingMutationRoutes(input);
}

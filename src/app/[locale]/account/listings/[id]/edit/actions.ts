'use server';

import { revalidateListingMutationRoutes } from '@/app/account/listingMutationRevalidation';

type EditedListingRevalidationInput = {
  listingId: string;
};

export async function revalidateEditedListingRoutes(
  input: EditedListingRevalidationInput
): Promise<void> {
  await revalidateListingMutationRoutes(input);
}

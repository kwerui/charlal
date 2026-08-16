'use server';

import {
  isListingReportReason,
  type ListingReportReason,
} from '@/lib/listingReports';
import {
  reportListing,
  type ListingReportMutationResult,
} from '@/lib/supabase/listingReports';

export async function reportListingAction({
  listingId,
  reason,
  details,
}: {
  listingId: string;
  reason: string;
  details: string;
}): Promise<ListingReportMutationResult> {
  if (!isListingReportReason(reason)) {
    return { ok: false, reason: 'invalid-reason' };
  }

  return reportListing({
    listingId,
    reason: reason as ListingReportReason,
    details,
  });
}

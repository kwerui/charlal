import { connection } from 'next/server';
import { getCurrentViewerId } from '@/lib/auth/server';
import {
  LISTING_REPORT_DETAILS_MAX_LENGTH,
  isListingReportReason,
  type ListingReportReason,
} from '@/lib/listingReports';
import { createClient } from '@/lib/supabase/server';

export type ListingReportFailureReason =
  | 'auth-required'
  | 'invalid-listing'
  | 'invalid-reason'
  | 'details-too-long'
  | 'own-listing'
  | 'database-unavailable';

export type ListingReportMutationResult =
  | {
      ok: true;
      status: 'created' | 'already-reported';
    }
  | {
      ok: false;
      reason: ListingReportFailureReason;
    };

export type CurrentUserListingReportState = {
  alreadyReported: boolean;
};

function classifyReportErrorMessage(
  message: string
): ListingReportFailureReason {
  const normalizedMessage = message.toLocaleLowerCase();

  if (normalizedMessage.includes('authenticated user is required')) {
    return 'auth-required';
  }

  if (normalizedMessage.includes('cannot report your own listing')) {
    return 'own-listing';
  }

  if (normalizedMessage.includes('report reason')) {
    return 'invalid-reason';
  }

  if (normalizedMessage.includes('details are too long')) {
    return 'details-too-long';
  }

  if (normalizedMessage.includes('listing is unavailable')) {
    return 'invalid-listing';
  }

  return 'database-unavailable';
}

export async function getCurrentUserListingReportState(
  listingId: string
): Promise<CurrentUserListingReportState> {
  await connection();

  const safeListingId = listingId.trim();

  if (!safeListingId || /^\d+$/.test(safeListingId)) {
    return { alreadyReported: false };
  }

  const viewer = await getCurrentViewerId();

  if (viewer.status !== 'signed-in') {
    return { alreadyReported: false };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('has_reported_listing', {
    p_listing_id: safeListingId,
  });

if (error) {
  console.warn(
    `[listing-report-state] lookup failed: ${error.code ?? 'unknown'}`
  );

    return { alreadyReported: false };
  }

  return { alreadyReported: data === true };
}

export async function reportListing({
  listingId,
  reason,
  details,
}: {
  listingId: string;
  reason: ListingReportReason;
  details: string;
}): Promise<ListingReportMutationResult> {
  await connection();

  const safeListingId = listingId.trim();
  const safeDetails = details.trim();

  if (!safeListingId || /^\d+$/.test(safeListingId)) {
    return { ok: false, reason: 'invalid-listing' };
  }

  if (!isListingReportReason(reason)) {
    return { ok: false, reason: 'invalid-reason' };
  }

  if (safeDetails.length > LISTING_REPORT_DETAILS_MAX_LENGTH) {
    return { ok: false, reason: 'details-too-long' };
  }

  const viewer = await getCurrentViewerId();

  if (viewer.status !== 'signed-in') {
    return { ok: false, reason: 'auth-required' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('report_listing', {
    p_listing_id: safeListingId,
    p_reason: reason,
    p_details: safeDetails || null,
  });

  if (error) {
    return {
      ok: false,
      reason: classifyReportErrorMessage(error.message || ''),
    };
  }

  return {
    ok: true,
    status: data === 'already_reported' ? 'already-reported' : 'created',
  };
}

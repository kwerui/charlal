'use server';

import {
  revalidateLocalizedPath,
  revalidateLocalizedRoutePattern,
} from '@/i18n/revalidate';
import {
  dismissListingReport,
  hideListingFromReport,
  reopenListingReport,
  restoreHiddenListing,
} from '@/lib/supabase/adminModeration';
import type { AdminReportActionState } from './actionTypes';

function getStringFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === 'string' ? value.trim() : '';
}

async function revalidateModerationRoutes(listingId?: string): Promise<void> {
  const safeListingId = listingId?.trim() || '';

  revalidateLocalizedPath('/admin/reports');
  revalidateLocalizedPath('/account');
  revalidateLocalizedPath('/');
  revalidateLocalizedPath('/search');
  revalidateLocalizedRoutePattern('/category/[slug]', 'page');
  revalidateLocalizedRoutePattern('/category/[slug]/[subcategory]', 'page');
  revalidateLocalizedRoutePattern('/seller/[slug]', 'page');

  if (safeListingId && !/^\d+$/.test(safeListingId)) {
    revalidateLocalizedPath(`/listing/${safeListingId}`);
  }
}

export async function dismissListingReportAction(
  _previousState: AdminReportActionState,
  formData: FormData
): Promise<AdminReportActionState> {
  const reportId = getStringFormValue(formData, 'reportId');
  const listingId = getStringFormValue(formData, 'listingId');
  const result = await dismissListingReport(reportId);

  if (result.ok) {
    await revalidateModerationRoutes(listingId);
    return { ok: true, messageKey: 'dismissed' };
  }

  return { ok: false, messageKey: 'failed' };
}

export async function hideListingFromReportAction(
  _previousState: AdminReportActionState,
  formData: FormData
): Promise<AdminReportActionState> {
  const reportId = getStringFormValue(formData, 'reportId');
  const listingId = getStringFormValue(formData, 'listingId');
  const result = await hideListingFromReport(reportId);

  if (result.ok) {
    await revalidateModerationRoutes(listingId);
    return { ok: true, messageKey: 'hidden' };
  }

  return { ok: false, messageKey: 'failed' };
}

export async function reopenListingReportAction(
  _previousState: AdminReportActionState,
  formData: FormData
): Promise<AdminReportActionState> {
  const reportId = getStringFormValue(formData, 'reportId');
  const listingId = getStringFormValue(formData, 'listingId');
  const result = await reopenListingReport(reportId);

  if (result.ok) {
    await revalidateModerationRoutes(listingId);
    return { ok: true, messageKey: 'reopened' };
  }

  return { ok: false, messageKey: 'failed' };
}

export async function restoreHiddenListingAction(
  _previousState: AdminReportActionState,
  formData: FormData
): Promise<AdminReportActionState> {
  const listingId = getStringFormValue(formData, 'listingId');
  const result = await restoreHiddenListing(listingId);

  if (result.ok) {
    await revalidateModerationRoutes(listingId);
    return { ok: true, messageKey: 'restored' };
  }

  return { ok: false, messageKey: 'failed' };
}

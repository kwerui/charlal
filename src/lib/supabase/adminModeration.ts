import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type AdminReportState =
  | 'open'
  | 'dismissed'
  | 'listing_hidden'
  | 'all';

export type AdminListingModerationState = 'normal' | 'hidden';

export type AdminListingReport = {
  reportId: string;
  reportState: Exclude<AdminReportState, 'all'>;
  reportReason: string;
  reportDetails: string | null;
  reportCreatedAt: string;
  reviewedAt: string | null;
  listingId: string | null;
  listingReference: string;
  listingTitle: string | null;
  listingTitleSnapshot: string;
  listingStatus: string | null;
  listingModerationState: AdminListingModerationState | null;
  reporterId: string;
  reporterDisplayName: string | null;
  sellerId: string;
  sellerDisplayName: string | null;
};

export type AdminModerationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: 'unauthorized' | 'database-unavailable';
    };

export type AdminListingReportsResult =
  | {
      ok: true;
      reports: AdminListingReport[];
    }
  | {
      ok: false;
      reason: 'unauthorized' | 'database-unavailable';
    };

type AdminListingReportRow = {
  report_id: string;
  report_state: Exclude<AdminReportState, 'all'>;
  report_reason: string;
  report_details: string | null;
  report_created_at: string;
  reviewed_at: string | null;
  listing_id: string | null;
  listing_reference: string;
  listing_title: string | null;
  listing_title_snapshot: string;
  listing_status: string | null;
  listing_moderation_state: AdminListingModerationState | null;
  reporter_id: string;
  reporter_display_name: string | null;
  seller_id: string;
  seller_display_name: string | null;
};

export function isAdminReportState(value: unknown): value is AdminReportState {
  return (
    value === 'open' ||
    value === 'dismissed' ||
    value === 'listing_hidden' ||
    value === 'all'
  );
}

function isStoredAdminReportState(
  value: unknown
): value is Exclude<AdminReportState, 'all'> {
  return value === 'open' || value === 'dismissed' || value === 'listing_hidden';
}

function isAdminListingModerationState(
  value: unknown
): value is AdminListingModerationState {
  return value === 'normal' || value === 'hidden';
}

function isAdminListingReportRow(value: unknown): value is AdminListingReportRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof AdminListingReportRow, unknown>>;

  return (
    typeof row.report_id === 'string' &&
    isStoredAdminReportState(row.report_state) &&
    typeof row.report_reason === 'string' &&
    (row.report_details === null || typeof row.report_details === 'string') &&
    typeof row.report_created_at === 'string' &&
    (row.reviewed_at === null || typeof row.reviewed_at === 'string') &&
    (row.listing_id === null || typeof row.listing_id === 'string') &&
    typeof row.listing_reference === 'string' &&
    (row.listing_title === null || typeof row.listing_title === 'string') &&
    typeof row.listing_title_snapshot === 'string' &&
    (row.listing_status === null || typeof row.listing_status === 'string') &&
    (row.listing_moderation_state === null ||
      isAdminListingModerationState(row.listing_moderation_state)) &&
    typeof row.reporter_id === 'string' &&
    (row.reporter_display_name === null ||
      typeof row.reporter_display_name === 'string') &&
    typeof row.seller_id === 'string' &&
    (row.seller_display_name === null ||
      typeof row.seller_display_name === 'string')
  );
}

function isAdminListingReportRowArray(
  value: unknown
): value is AdminListingReportRow[] {
  return Array.isArray(value) && value.every(isAdminListingReportRow);
}

function mapAdminListingReportRow(
  row: AdminListingReportRow
): AdminListingReport {
  return {
    reportId: row.report_id,
    reportState: row.report_state,
    reportReason: row.report_reason,
    reportDetails: row.report_details,
    reportCreatedAt: row.report_created_at,
    reviewedAt: row.reviewed_at,
    listingId: row.listing_id,
    listingReference: row.listing_reference,
    listingTitle: row.listing_title,
    listingTitleSnapshot: row.listing_title_snapshot,
    listingStatus: row.listing_status,
    listingModerationState: row.listing_moderation_state,
    reporterId: row.reporter_id,
    reporterDisplayName: row.reporter_display_name,
    sellerId: row.seller_id,
    sellerDisplayName: row.seller_display_name,
  };
}

function classifyAdminError(
  message: string | undefined
): 'unauthorized' | 'database-unavailable' {
  return message?.toLocaleLowerCase().includes('admin access is required')
    ? 'unauthorized'
    : 'database-unavailable';
}

export async function getCurrentUserIsAdmin(): Promise<boolean> {
  await connection();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('current_user_is_admin');

  return !error && data === true;
}

export async function listAdminListingReports(input?: {
  state?: AdminReportState;
  limit?: number;
  offset?: number;
}): Promise<AdminListingReportsResult> {
  await connection();

  const state = isAdminReportState(input?.state) ? input.state : 'open';
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('list_admin_listing_reports', {
    p_state: state,
    p_limit: input?.limit ?? 50,
    p_offset: input?.offset ?? 0,
  });

  if (error) {
    return { ok: false, reason: classifyAdminError(error.message) };
  }

  if (!isAdminListingReportRowArray(data)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return {
    ok: true,
    reports: data.map(mapAdminListingReportRow),
  };
}

export async function dismissListingReport(
  reportId: string
): Promise<AdminModerationResult> {
  await connection();

  const supabase = await createClient();
  const { error } = await supabase.rpc('dismiss_listing_report', {
    p_report_id: reportId,
  });

  return error ? { ok: false, reason: classifyAdminError(error.message) } : { ok: true };
}

export async function reopenListingReport(
  reportId: string
): Promise<AdminModerationResult> {
  await connection();

  const supabase = await createClient();
  const { error } = await supabase.rpc('reopen_listing_report', {
    p_report_id: reportId,
  });

  return error ? { ok: false, reason: classifyAdminError(error.message) } : { ok: true };
}

export async function hideListingFromReport(
  reportId: string
): Promise<AdminModerationResult> {
  await connection();

  const supabase = await createClient();
  const { error } = await supabase.rpc('hide_listing_from_report', {
    p_report_id: reportId,
  });

  return error ? { ok: false, reason: classifyAdminError(error.message) } : { ok: true };
}

export async function restoreHiddenListing(
  listingId: string
): Promise<AdminModerationResult> {
  await connection();

  const safeListingId = listingId.trim();

  if (!safeListingId || /^\d+$/.test(safeListingId)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('restore_hidden_listing', {
    p_listing_id: safeListingId,
  });

  return error ? { ok: false, reason: classifyAdminError(error.message) } : { ok: true };
}

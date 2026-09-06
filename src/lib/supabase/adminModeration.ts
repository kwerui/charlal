import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type AdminReportState =
  | 'open'
  | 'dismissed'
  | 'listing_hidden'
  | 'all';

export type AdminListingModerationState = 'normal' | 'hidden';
export type AdminUserModerationState = 'normal' | 'suspended';

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
      reason: AdminModerationFailureReason;
    };

type AdminModerationFailureReason =
  | 'unauthorized'
  | 'self'
  | 'admin-target'
  | 'not-found'
  | 'database-unavailable';

export type AdminListingReportsResult =
  | {
      ok: true;
      reports: AdminListingReport[];
    }
  | {
      ok: false;
      reason: 'unauthorized' | 'database-unavailable';
    };

export type CurrentUserSuspensionResult =
  | {
      ok: true;
      isSuspended: boolean;
    }
  | {
      ok: false;
      reason: 'unauthenticated' | 'database-unavailable';
    };

export type AdminUserProfile = {
  id: string;
  displayName: string;
  publicSlug: string;
  email: string | null;
  createdAt: string | null;
};

export type AdminUserModeration = {
  userId: string;
  state: AdminUserModerationState;
  changedAt: string | null;
  changedBy: string | null;
};

export type AdminUserModerationAuditEvent = {
  id: string;
  actorId: string;
  actorDisplayName: string | null;
  targetUserId: string;
  action: 'user_suspended' | 'user_restored';
  previousState: AdminUserModerationState;
  newState: AdminUserModerationState;
  createdAt: string;
};

export type AdminUserProfileResult =
  | {
      ok: true;
      profile: AdminUserProfile | null;
    }
  | {
      ok: false;
      reason: 'unauthorized' | 'database-unavailable';
    };

export type AdminUserModerationResult =
  | {
      ok: true;
      moderation: AdminUserModeration;
    }
  | {
      ok: false;
      reason: 'unauthorized' | 'database-unavailable';
    };

export type AdminUserModerationAuditResult =
  | {
      ok: true;
      events: AdminUserModerationAuditEvent[];
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

type AdminUserProfileRow = {
  user_id: string;
  display_name: string;
  public_slug: string;
  email: string | null;
  created_at: string | null;
};

type AdminUserModerationRow = {
  user_id: string;
  state: AdminUserModerationState;
  changed_at: string | null;
  changed_by: string | null;
};

type AdminUserModerationAuditRow = {
  event_id: string;
  actor_id: string;
  actor_display_name: string | null;
  target_user_id: string;
  action: 'user_suspended' | 'user_restored';
  previous_state: AdminUserModerationState;
  new_state: AdminUserModerationState;
  created_at: string;
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

function isAdminUserModerationState(
  value: unknown
): value is AdminUserModerationState {
  return value === 'normal' || value === 'suspended';
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

function isAdminUserProfileRow(value: unknown): value is AdminUserProfileRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof AdminUserProfileRow, unknown>>;

  return (
    typeof row.user_id === 'string' &&
    typeof row.display_name === 'string' &&
    typeof row.public_slug === 'string' &&
    (row.email === null || typeof row.email === 'string') &&
    (row.created_at === null || typeof row.created_at === 'string')
  );
}

function isAdminUserModerationRow(
  value: unknown
): value is AdminUserModerationRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof AdminUserModerationRow, unknown>>;

  return (
    typeof row.user_id === 'string' &&
    isAdminUserModerationState(row.state) &&
    (row.changed_at === null || typeof row.changed_at === 'string') &&
    (row.changed_by === null || typeof row.changed_by === 'string')
  );
}

function isAdminUserModerationAuditRow(
  value: unknown
): value is AdminUserModerationAuditRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof AdminUserModerationAuditRow, unknown>>;

  return (
    typeof row.event_id === 'string' &&
    typeof row.actor_id === 'string' &&
    (row.actor_display_name === null || typeof row.actor_display_name === 'string') &&
    typeof row.target_user_id === 'string' &&
    (row.action === 'user_suspended' || row.action === 'user_restored') &&
    isAdminUserModerationState(row.previous_state) &&
    isAdminUserModerationState(row.new_state) &&
    typeof row.created_at === 'string'
  );
}

function isAdminListingReportRowArray(
  value: unknown
): value is AdminListingReportRow[] {
  return Array.isArray(value) && value.every(isAdminListingReportRow);
}

function isAdminUserModerationAuditRowArray(
  value: unknown
): value is AdminUserModerationAuditRow[] {
  return Array.isArray(value) && value.every(isAdminUserModerationAuditRow);
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

function mapAdminUserProfileRow(row: AdminUserProfileRow): AdminUserProfile {
  return {
    id: row.user_id,
    displayName: row.display_name,
    publicSlug: row.public_slug,
    email: row.email,
    createdAt: row.created_at,
  };
}

function mapAdminUserModerationRow(
  row: AdminUserModerationRow
): AdminUserModeration {
  return {
    userId: row.user_id,
    state: row.state,
    changedAt: row.changed_at,
    changedBy: row.changed_by,
  };
}

function mapAdminUserModerationAuditRow(
  row: AdminUserModerationAuditRow
): AdminUserModerationAuditEvent {
  return {
    id: row.event_id,
    actorId: row.actor_id,
    actorDisplayName: row.actor_display_name,
    targetUserId: row.target_user_id,
    action: row.action,
    previousState: row.previous_state,
    newState: row.new_state,
    createdAt: row.created_at,
  };
}

function classifyAdminError(
  message: string | undefined
): AdminModerationFailureReason {
  const safeMessage = message?.toLocaleLowerCase() || '';

  if (safeMessage.includes('admin access is required')) {
    return 'unauthorized';
  }

  if (safeMessage.includes('cannot suspend themselves')) {
    return 'self';
  }

  if (safeMessage.includes('admin users cannot be suspended')) {
    return 'admin-target';
  }

  if (safeMessage.includes('user is unavailable')) {
    return 'not-found';
  }

  return 'database-unavailable';
}

function classifyAdminReadError(
  message: string | undefined
): 'unauthorized' | 'database-unavailable' {
  return classifyAdminError(message) === 'unauthorized'
    ? 'unauthorized'
    : 'database-unavailable';
}

export async function getCurrentUserSuspension(): Promise<CurrentUserSuspensionResult> {
  await connection();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('current_user_is_suspended');

  if (error) {
    const reason = error.message.toLocaleLowerCase().includes('authenticated user is required')
      ? 'unauthenticated'
      : 'database-unavailable';

    return { ok: false, reason };
  }

  return { ok: true, isSuspended: data === true };
}

export async function getCurrentUserIsAdmin(): Promise<boolean> {
  await connection();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('current_user_is_admin');

  return !error && data === true;
}

export async function getAdminUserProfile(
  userId: string
): Promise<AdminUserProfileResult> {
  await connection();

  const safeUserId = userId.trim();

  if (!safeUserId) {
    return { ok: true, profile: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_get_user_profile', {
    p_user_id: safeUserId,
  });

  if (error) {
    return { ok: false, reason: classifyAdminReadError(error.message) };
  }

  const rows = Array.isArray(data) ? data : [];
  const row = rows[0];

  if (!row) {
    return { ok: true, profile: null };
  }

  if (!isAdminUserProfileRow(row)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return { ok: true, profile: mapAdminUserProfileRow(row) };
}

export async function getAdminUserModeration(
  userId: string
): Promise<AdminUserModerationResult> {
  await connection();

  const safeUserId = userId.trim();

  if (!safeUserId) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_get_user_moderation_state', {
    p_user_id: safeUserId,
  });

  if (error) {
    return { ok: false, reason: classifyAdminReadError(error.message) };
  }

  const rows = Array.isArray(data) ? data : [];
  const row = rows[0];

  if (!isAdminUserModerationRow(row)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return { ok: true, moderation: mapAdminUserModerationRow(row) };
}

export async function listAdminUserModerationAuditEvents(
  userId: string
): Promise<AdminUserModerationAuditResult> {
  await connection();

  const safeUserId = userId.trim();

  if (!safeUserId) {
    return { ok: true, events: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    'list_admin_user_moderation_audit_events',
    {
      p_user_id: safeUserId,
    }
  );

  if (error) {
    return { ok: false, reason: classifyAdminReadError(error.message) };
  }

  if (!isAdminUserModerationAuditRowArray(data)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return { ok: true, events: data.map(mapAdminUserModerationAuditRow) };
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
    return { ok: false, reason: classifyAdminReadError(error.message) };
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

export async function suspendUser(userId: string): Promise<AdminModerationResult> {
  await connection();

  const safeUserId = userId.trim();

  if (!safeUserId) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('suspend_user', {
    p_user_id: safeUserId,
  });

  return error ? { ok: false, reason: classifyAdminError(error.message) } : { ok: true };
}

export async function restoreUser(userId: string): Promise<AdminModerationResult> {
  await connection();

  const safeUserId = userId.trim();

  if (!safeUserId) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('restore_user', {
    p_user_id: safeUserId,
  });

  return error ? { ok: false, reason: classifyAdminError(error.message) } : { ok: true };
}

'use server';

import {
  revalidateLocalizedPath,
  revalidateLocalizedRoutePattern,
} from '@/i18n/revalidate';
import { restoreUser, suspendUser } from '@/lib/supabase/adminModeration';
import type { AdminUserActionState } from './actionTypes';

function getStringFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === 'string' ? value.trim() : '';
}

function getFailureMessageKey(
  reason: 'unauthorized' | 'self' | 'admin-target' | 'not-found' | 'database-unavailable'
): AdminUserActionState['messageKey'] {
  if (reason === 'self') {
    return 'self';
  }

  if (reason === 'admin-target') {
    return 'adminTarget';
  }

  if (reason === 'not-found') {
    return 'notFound';
  }

  return 'failed';
}

async function revalidateAdminUserRoutes(userId: string): Promise<void> {
  revalidateLocalizedPath('/admin/reports');
  revalidateLocalizedPath(`/admin/users/${userId}`);
  revalidateLocalizedPath('/account');
  revalidateLocalizedPath('/');
  revalidateLocalizedPath('/search');
  revalidateLocalizedRoutePattern('/category/[slug]', 'page');
  revalidateLocalizedRoutePattern('/category/[slug]/[subcategory]', 'page');
  revalidateLocalizedRoutePattern('/seller/[slug]', 'page');
}

export async function suspendUserAction(
  _previousState: AdminUserActionState,
  formData: FormData
): Promise<AdminUserActionState> {
  const userId = getStringFormValue(formData, 'userId');
  const result = await suspendUser(userId);

  if (!result.ok) {
    return { ok: false, messageKey: getFailureMessageKey(result.reason) };
  }

  await revalidateAdminUserRoutes(userId);

  return { ok: true, messageKey: 'suspended' };
}

export async function restoreUserAction(
  _previousState: AdminUserActionState,
  formData: FormData
): Promise<AdminUserActionState> {
  const userId = getStringFormValue(formData, 'userId');
  const result = await restoreUser(userId);

  if (!result.ok) {
    return { ok: false, messageKey: getFailureMessageKey(result.reason) };
  }

  await revalidateAdminUserRoutes(userId);

  return { ok: true, messageKey: 'restored' };
}

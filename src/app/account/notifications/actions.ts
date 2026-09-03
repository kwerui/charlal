'use server';

import { revalidateLocalizedPath } from '@/i18n/revalidate';
import type { AppNotification } from '@/lib/notificationsTypes';
import { getCurrentUserResult } from '@/lib/auth/server';
import {
  countCurrentUserUnreadNotifications,
  listCurrentUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationsFailureReason,
} from '@/lib/supabase/notifications';

export type NotificationsSnapshotActionResult =
  | {
      ok: true;
      unreadNotificationCount: number;
      notifications: AppNotification[];
    }
  | {
      ok: false;
      reason: NotificationsFailureReason;
    };

export type NotificationMutationActionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: NotificationsFailureReason;
    };

export async function getNotificationsSnapshotAction(): Promise<NotificationsSnapshotActionResult> {
  const authResult = await getCurrentUserResult();

  if (authResult.status !== 'authenticated') {
    return { ok: false, reason: 'unauthenticated' };
  }

  const notificationsResult = await listCurrentUserNotifications();

  if (!notificationsResult.ok) {
    return notificationsResult;
  }

  const unreadCountResult = await countCurrentUserUnreadNotifications();

  if (!unreadCountResult.ok) {
    return unreadCountResult;
  }

  return {
    ok: true,
    notifications: notificationsResult.notifications,
    unreadNotificationCount: unreadCountResult.count,
  };
}

export async function markNotificationReadAction(
  notificationId: string
): Promise<NotificationMutationActionResult> {
  const authResult = await getCurrentUserResult();

  if (authResult.status !== 'authenticated') {
    return { ok: false, reason: 'unauthenticated' };
  }

  const result = await markNotificationRead(notificationId);

  if (!result.ok) {
    return result;
  }

  revalidateLocalizedPath('/account/notifications');

  return result;
}

export async function markAllNotificationsReadAction(): Promise<NotificationMutationActionResult> {
  const authResult = await getCurrentUserResult();

  if (authResult.status !== 'authenticated') {
    return { ok: false, reason: 'unauthenticated' };
  }

  const result = await markAllNotificationsRead();

  if (!result.ok) {
    return result;
  }

  revalidateLocalizedPath('/account/notifications');

  return result;
}

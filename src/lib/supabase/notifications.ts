import { connection } from 'next/server';
import {
  databaseNotificationRowToApp,
  isDatabaseNotificationRowArray,
  type AppNotification,
} from '@/lib/notificationsTypes';
import { createClient } from '@/lib/supabase/server';

export type NotificationsFailureReason =
  | 'unauthenticated'
  | 'database-unavailable';

export type NotificationsResult =
  | {
      ok: true;
      notifications: AppNotification[];
    }
  | {
      ok: false;
      reason: NotificationsFailureReason;
    };

export type UnreadNotificationsCountResult =
  | {
      ok: true;
      count: number;
    }
  | {
      ok: false;
      reason: NotificationsFailureReason;
    };

export type NotificationMutationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: NotificationsFailureReason;
    };

function classifyNotificationError(
  message: string | undefined
): NotificationsFailureReason {
  const safeMessage = message?.toLocaleLowerCase() || '';

  if (safeMessage.includes('authenticated user is required')) {
    return 'unauthenticated';
  }

  return 'database-unavailable';
}

export async function listCurrentUserNotifications(input?: {
  limit?: number;
  offset?: number;
}): Promise<NotificationsResult> {
  await connection();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('list_my_notifications', {
    p_limit: input?.limit ?? 30,
    p_offset: input?.offset ?? 0,
  });

  if (error || !isDatabaseNotificationRowArray(data)) {
    return {
      ok: false,
      reason: classifyNotificationError(error?.message),
    };
  }

  return {
    ok: true,
    notifications: data.map(databaseNotificationRowToApp),
  };
}

export async function countCurrentUserUnreadNotifications(): Promise<UnreadNotificationsCountResult> {
  await connection();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('count_unread_notifications');

  if (error || typeof data !== 'number') {
    return {
      ok: false,
      reason: classifyNotificationError(error?.message),
    };
  }

  return {
    ok: true,
    count: data,
  };
}

export async function markNotificationRead(
  notificationId: string
): Promise<NotificationMutationResult> {
  await connection();

  const safeNotificationId = notificationId.trim();

  if (!safeNotificationId) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_notification_read', {
    p_notification_id: safeNotificationId,
  });

  if (error) {
    return {
      ok: false,
      reason: classifyNotificationError(error.message),
    };
  }

  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<NotificationMutationResult> {
  await connection();

  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_all_notifications_read');

  if (error) {
    return {
      ok: false,
      reason: classifyNotificationError(error.message),
    };
  }

  return { ok: true };
}

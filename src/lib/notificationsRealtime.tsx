'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getNotificationsSnapshotAction } from '@/app/account/notifications/actions';
import { useAuthStatus } from '@/lib/auth/client';
import { getRealtimeChannelName } from '@/lib/messageThreadClientBehavior';
import type { MessagingRealtimeStatus } from '@/lib/messagingRealtimeClientBehavior';
import {
  getMessagingRealtimeStatusAfterSnapshotRefresh,
  getMessagingRealtimeStatusAfterSubscriptionStatus,
} from '@/lib/messagingRealtimeClientBehavior';
import type { AppNotification } from '@/lib/notificationsTypes';
import { createClient } from '@/lib/supabase/client';
import {
  getRealtimeDiagnostics,
  logRealtimeDiagnostic,
  subscribeWithRealtimeDiagnostics,
} from '@/lib/supabase/realtimeDiagnostics';

type NotificationsRealtimeContextValue = {
  unreadNotificationCount: number;
  notifications: AppNotification[] | null;
  status: MessagingRealtimeStatus;
  refreshNotificationsState: () => Promise<void>;
};

type NotificationsSnapshotState = {
  userId: string | null;
  unreadNotificationCount: number;
  notifications: AppNotification[] | null;
};

type ChannelStatusState = {
  userId: string | null;
  status: MessagingRealtimeStatus;
};

const NotificationsRealtimeContext = createContext<
  NotificationsRealtimeContextValue | undefined
>(undefined);

type Props = {
  initialUnreadNotificationCount?: number;
  children: ReactNode;
};

export function NotificationsRealtimeProvider({
  initialUnreadNotificationCount = 0,
  children,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { status: authStatus, user } = useAuthStatus();
  const userId = authStatus === 'authenticated' ? user?.id || null : null;
  const [snapshot, setSnapshot] = useState<NotificationsSnapshotState>({
    userId: null,
    unreadNotificationCount: initialUnreadNotificationCount,
    notifications: null,
  });
  const [channelStatus, setChannelStatus] = useState<ChannelStatusState>({
    userId: null,
    status: 'idle',
  });
  const currentUserIdRef = useRef<string | null>(userId);
  const refreshInFlightRef = useRef(false);
  const refreshAgainRef = useRef(false);
  const channelStatusVersionRef = useRef(0);
  const activeChannelGenerationRef = useRef(0);
  const hasSubscribedRef = useRef(false);
  const [channelReconnectGeneration, setChannelReconnectGeneration] =
    useState(0);

  useEffect(() => {
    currentUserIdRef.current = userId;
  }, [userId]);

  const refreshNotificationsStateForUser = useCallback(
    async (targetUserId: string): Promise<void> => {
      if (refreshInFlightRef.current) {
        refreshAgainRef.current = true;
        return;
      }

      refreshInFlightRef.current = true;

      try {
        let shouldRefreshAgain = true;

        while (shouldRefreshAgain) {
          refreshAgainRef.current = false;
          const nextSnapshot = await getNotificationsSnapshotAction();

          if (
            nextSnapshot.ok &&
            currentUserIdRef.current === targetUserId
          ) {
            setSnapshot({
              userId: targetUserId,
              unreadNotificationCount: nextSnapshot.unreadNotificationCount,
              notifications: nextSnapshot.notifications,
            });
            setChannelStatus((currentStatus) => ({
              userId: targetUserId,
              status:
                currentStatus.userId === targetUserId
                  ? getMessagingRealtimeStatusAfterSnapshotRefresh(
                      currentStatus.status
                    )
                  : 'idle',
            }));
          }

          shouldRefreshAgain = refreshAgainRef.current;
        }
      } finally {
        refreshInFlightRef.current = false;
        refreshAgainRef.current = false;
      }
    },
    []
  );

  const refreshNotificationsState = useCallback(async (): Promise<void> => {
    const targetUserId = currentUserIdRef.current;

    if (!targetUserId) {
      return;
    }

    await refreshNotificationsStateForUser(targetUserId);
  }, [refreshNotificationsStateForUser]);

  useEffect(() => {
    if (!userId) {
      hasSubscribedRef.current = false;
      activeChannelGenerationRef.current += 1;
      return undefined;
    }

    let active = true;
    const channelGeneration = activeChannelGenerationRef.current + 1;
    activeChannelGenerationRef.current = channelGeneration;
    const channelBaseName = `notifications-global:${userId}`;
    const channelName = getRealtimeChannelName(
      channelBaseName,
      channelGeneration
    );

    queueMicrotask(() => {
      if (active) {
        void refreshNotificationsStateForUser(userId);
      }
    });

    const requestSnapshotRefresh = () => {
      if (
        active &&
        activeChannelGenerationRef.current === channelGeneration
      ) {
        void refreshNotificationsStateForUser(userId);
      }
    };
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (
          !active ||
          activeChannelGenerationRef.current !== channelGeneration
        ) {
          return false;
        }

        if (
          error ||
          !data.session?.access_token ||
          data.session.user.id !== userId
        ) {
          setChannelStatus({
            userId,
            status: 'unavailable',
          });
          return false;
        }

        await supabase.realtime.setAuth(data.session.access_token);
        return true;
      })
      .then((canJoin) => {
        if (
          !canJoin ||
          !active ||
          activeChannelGenerationRef.current !== channelGeneration
        ) {
          return;
        }

        setChannelStatus({
          userId,
          status: 'reconnecting',
        });

        channel = supabase.channel(channelName).on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          requestSnapshotRefresh
        );

        subscribeWithRealtimeDiagnostics(
          supabase,
          channel,
          {
            eventPrefix: 'notifications-global',
            channelName,
            logicalChannelBaseName: channelBaseName,
            details: {
              owner: 'notifications-global',
              authStatus,
              userId,
              generation: channelGeneration,
            },
          },
          (nextStatus) => {
            if (
              !active ||
              activeChannelGenerationRef.current !== channelGeneration
            ) {
              return;
            }

            if (nextStatus === 'SUBSCRIBED') {
              channelStatusVersionRef.current += 1;
              hasSubscribedRef.current = true;
              setChannelStatus({
                userId,
                status: getMessagingRealtimeStatusAfterSubscriptionStatus({
                  nextStatus,
                  hadSubscribed: false,
                }),
              });
              void refreshNotificationsStateForUser(userId);
              return;
            }

            if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT') {
              const statusVersion = channelStatusVersionRef.current + 1;
              channelStatusVersionRef.current = statusVersion;

              queueMicrotask(() => {
                if (
                  active &&
                  activeChannelGenerationRef.current === channelGeneration &&
                  channelStatusVersionRef.current === statusVersion
                ) {
                  setChannelStatus({
                    userId,
                    status: getMessagingRealtimeStatusAfterSubscriptionStatus({
                      nextStatus,
                      hadSubscribed: hasSubscribedRef.current,
                    }),
                  });
                  setChannelReconnectGeneration((generation) => generation + 1);
                }
              });
              return;
            }

            if (nextStatus === 'CLOSED') {
              const statusVersion = channelStatusVersionRef.current + 1;
              channelStatusVersionRef.current = statusVersion;

              queueMicrotask(() => {
                if (
                  active &&
                  activeChannelGenerationRef.current === channelGeneration &&
                  channelStatusVersionRef.current === statusVersion
                ) {
                  setChannelStatus({
                    userId,
                    status: getMessagingRealtimeStatusAfterSubscriptionStatus({
                      nextStatus,
                      hadSubscribed: hasSubscribedRef.current,
                    }),
                  });

                  if (hasSubscribedRef.current) {
                    setChannelReconnectGeneration(
                      (generation) => generation + 1
                    );
                  }
                }
              });
            }
          }
        );
      })
      .catch(() => {
        if (
          active &&
          activeChannelGenerationRef.current === channelGeneration
        ) {
          setChannelStatus({
            userId,
            status: 'unavailable',
          });
        }
      });

    return () => {
      active = false;
      if (activeChannelGenerationRef.current === channelGeneration) {
        activeChannelGenerationRef.current += 1;
      }
      hasSubscribedRef.current = false;

      if (channel) {
        const channelToRemove = channel;

        void supabase.removeChannel(channelToRemove).catch((error: unknown) => {
          logRealtimeDiagnostic('notifications-global-cleanup-remove-failed', {
            owner: 'notifications-global',
            authStatus,
            userId,
            generation: channelGeneration,
            channelName,
            error: error instanceof Error ? error.message : String(error),
            ...getRealtimeDiagnostics(supabase, channelName, channelBaseName),
          });
        });
      }
    };
  }, [
    authStatus,
    channelReconnectGeneration,
    refreshNotificationsStateForUser,
    supabase,
    userId,
  ]);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    const targetUserId = userId;

    function handleOnline(): void {
      if (hasSubscribedRef.current) {
        channelStatusVersionRef.current += 1;
        setChannelStatus({
          userId: targetUserId,
          status: 'reconnecting',
        });
        setChannelReconnectGeneration((generation) => generation + 1);
      } else {
        void refreshNotificationsStateForUser(targetUserId);
      }
    }

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [refreshNotificationsStateForUser, userId]);

  const unreadNotificationCount =
    authStatus === 'authenticated' && userId
      ? snapshot.userId === userId
        ? snapshot.unreadNotificationCount
        : initialUnreadNotificationCount
      : authStatus === 'checking'
        ? initialUnreadNotificationCount
        : 0;
  const notifications =
    authStatus === 'authenticated' && userId && snapshot.userId === userId
      ? snapshot.notifications
      : null;
  const visibleStatus =
    authStatus === 'authenticated' &&
    userId &&
    channelStatus.userId === userId
      ? channelStatus.status
      : 'idle';

  const value = useMemo<NotificationsRealtimeContextValue>(
    () => ({
      unreadNotificationCount,
      notifications,
      status: visibleStatus,
      refreshNotificationsState,
    }),
    [
      notifications,
      refreshNotificationsState,
      visibleStatus,
      unreadNotificationCount,
    ]
  );

  return (
    <NotificationsRealtimeContext.Provider value={value}>
      {children}
    </NotificationsRealtimeContext.Provider>
  );
}

export function useNotificationsRealtime(): NotificationsRealtimeContextValue {
  const context = useContext(NotificationsRealtimeContext);

  if (!context) {
    throw new Error(
      'useNotificationsRealtime must be used within NotificationsRealtimeProvider.'
    );
  }

  return context;
}

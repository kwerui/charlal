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
import { getMessagingSnapshotAction } from '@/app/account/messages/actions';
import type { AppConversationSummary } from '@/lib/messagingTypes';
import { useAuthStatus } from '@/lib/auth/client';
import {
  getMessagingRealtimeStatusAfterSnapshotRefresh,
  getMessagingRealtimeStatusAfterSubscriptionStatus,
  type MessagingRealtimeStatus,
} from '@/lib/messagingRealtimeClientBehavior';
import { getRealtimeChannelName } from '@/lib/messageThreadClientBehavior';
import { createClient } from '@/lib/supabase/client';
import {
  getRealtimeDiagnostics,
  logRealtimeDiagnostic,
  subscribeWithRealtimeDiagnostics,
} from '@/lib/supabase/realtimeDiagnostics';

type MessagingRealtimeContextValue = {
  unreadConversationCount: number;
  conversations: AppConversationSummary[] | null;
  status: MessagingRealtimeStatus;
  refreshMessagingState: () => Promise<void>;
};

const MessagingRealtimeContext =
  createContext<MessagingRealtimeContextValue | undefined>(undefined);

type Props = {
  initialUnreadConversationCount?: number;
  children: ReactNode;
};

type MessagingSnapshotState = {
  userId: string | null;
  unreadConversationCount: number;
  conversations: AppConversationSummary[] | null;
};

type ChannelStatusState = {
  userId: string | null;
  status: MessagingRealtimeStatus;
};

function serializeMessagingRealtimeError(
  error: Error | undefined
): Record<string, unknown> {
  if (!error) {
    return {
      hasError: false,
    };
  }

  const cause =
    'cause' in error && error.cause && typeof error.cause === 'object'
      ? error.cause
      : null;

  return {
    hasError: true,
    errorName: error.name,
    errorMessage: error.message,
    errorCause: cause,
  };
}

export function MessagingRealtimeProvider({
  initialUnreadConversationCount = 0,
  children,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { status: authStatus, user } = useAuthStatus();
  const userId = authStatus === 'authenticated' ? user?.id || null : null;
  const [snapshot, setSnapshot] = useState<MessagingSnapshotState>({
    userId: null,
    unreadConversationCount: initialUnreadConversationCount,
    conversations: null,
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

  const refreshMessagingStateForUser = useCallback(
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

          const nextSnapshot = await getMessagingSnapshotAction();

          if (
            nextSnapshot.ok &&
            currentUserIdRef.current === targetUserId
          ) {
            setSnapshot({
              userId: targetUserId,
              unreadConversationCount: nextSnapshot.unreadConversationCount,
              conversations: nextSnapshot.conversations,
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

  const refreshMessagingState = useCallback(async (): Promise<void> => {
    const targetUserId = currentUserIdRef.current;

    if (!targetUserId) {
      return;
    }

    await refreshMessagingStateForUser(targetUserId);
  }, [refreshMessagingStateForUser]);

  useEffect(() => {
    if (!userId) {
      hasSubscribedRef.current = false;
      activeChannelGenerationRef.current += 1;
      logRealtimeDiagnostic('messaging-global-skipped', {
        owner: 'messaging-global',
        authStatus,
        userId: null,
        ...getRealtimeDiagnostics(supabase),
      });
      return undefined;
    }

    let active = true;
    const channelGeneration = activeChannelGenerationRef.current + 1;
    activeChannelGenerationRef.current = channelGeneration;
    const channelBaseName = `messaging-global:${userId}`;
    const channelName = getRealtimeChannelName(
      channelBaseName,
      channelGeneration
    );

    queueMicrotask(() => {
      if (active) {
        void refreshMessagingStateForUser(userId);
      }
    });

    const requestSnapshotRefresh = () => {
      if (
        active &&
        activeChannelGenerationRef.current === channelGeneration
      ) {
        void refreshMessagingStateForUser(userId);
      }
    };
    let channel: ReturnType<typeof supabase.channel> | null = null;

    logRealtimeDiagnostic('messaging-global-effect-start', {
      owner: 'messaging-global',
      authStatus,
      userId,
      generation: channelGeneration,
      channelName,
      ...getRealtimeDiagnostics(supabase, channelName, channelBaseName),
    });

    void supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (
          !active ||
          activeChannelGenerationRef.current !== channelGeneration
        ) {
          return false;
        }

        const sessionUserId = data.session?.user?.id || null;
        const hasSessionAccessToken = Boolean(data.session?.access_token);

        logRealtimeDiagnostic('messaging-global-session-resolved', {
          owner: 'messaging-global',
          authStatus,
          userId,
          generation: channelGeneration,
          sessionUserId,
          hasSessionAccessToken,
          sessionError: error?.message || null,
          ...getRealtimeDiagnostics(supabase, channelName, channelBaseName),
        });

        if (
          error ||
          !data.session?.access_token ||
          sessionUserId !== userId
        ) {
          setChannelStatus({
            userId,
            status: 'unavailable',
          });
          logRealtimeDiagnostic('messaging-global-session-unavailable', {
            owner: 'messaging-global',
            authStatus,
            userId,
            generation: channelGeneration,
            sessionUserId,
            hasSessionAccessToken,
            sessionError: error?.message || null,
            ...getRealtimeDiagnostics(supabase, channelName, channelBaseName),
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

        channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'messages',
            },
            requestSnapshotRefresh
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'conversation_reads',
              filter: `user_id=eq.${userId}`,
            },
            requestSnapshotRefresh
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'conversation_user_state',
              filter: `user_id=eq.${userId}`,
            },
            requestSnapshotRefresh
          );

        subscribeWithRealtimeDiagnostics(
          supabase,
          channel,
          {
            eventPrefix: 'messaging-global',
            channelName,
            logicalChannelBaseName: channelBaseName,
            details: {
              owner: 'messaging-global',
              authStatus,
              userId,
              generation: channelGeneration,
            },
          },
          (nextStatus, error) => {
          if (
            !active ||
            activeChannelGenerationRef.current !== channelGeneration
          ) {
            logRealtimeDiagnostic('messaging-global-stale-status', {
              owner: 'messaging-global',
              authStatus,
              userId,
              generation: channelGeneration,
              latestGeneration: activeChannelGenerationRef.current,
              status: nextStatus,
              ...serializeMessagingRealtimeError(error),
              ...getRealtimeDiagnostics(supabase, channelName, channelBaseName),
            });
            return;
          }

          logRealtimeDiagnostic('messaging-global-status', {
            owner: 'messaging-global',
            authStatus,
            userId,
            generation: channelGeneration,
            status: nextStatus,
            ...serializeMessagingRealtimeError(error),
            ...getRealtimeDiagnostics(supabase, channelName, channelBaseName),
          });

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
            return;
          }

          if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT') {
            const statusVersion = channelStatusVersionRef.current + 1;
            channelStatusVersionRef.current = statusVersion;
            logRealtimeDiagnostic('messaging-global-failed-status', {
              owner: 'messaging-global',
              authStatus,
              userId,
              generation: channelGeneration,
              status: nextStatus,
              hadSubscribed: hasSubscribedRef.current,
              ...serializeMessagingRealtimeError(error),
              ...getRealtimeDiagnostics(supabase, channelName, channelBaseName),
            });

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
              }
            });
            return;
          }

          if (nextStatus === 'CLOSED') {
            const statusVersion = channelStatusVersionRef.current + 1;
            channelStatusVersionRef.current = statusVersion;
            logRealtimeDiagnostic('messaging-global-closed-status', {
              owner: 'messaging-global',
              authStatus,
              userId,
              generation: channelGeneration,
              status: nextStatus,
              hadSubscribed: hasSubscribedRef.current,
              ...serializeMessagingRealtimeError(error),
              ...getRealtimeDiagnostics(supabase, channelName, channelBaseName),
            });

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
              }
            });
          }
        });
      })
      .catch((error: unknown) => {
        if (
          !active ||
          activeChannelGenerationRef.current !== channelGeneration
        ) {
          return;
        }

        setChannelStatus({
          userId,
          status: 'unavailable',
        });
        logRealtimeDiagnostic('messaging-global-start-failed', {
          owner: 'messaging-global',
          authStatus,
          userId,
          generation: channelGeneration,
          error:
            error instanceof Error
              ? serializeMessagingRealtimeError(error)
              : { errorMessage: String(error) },
          ...getRealtimeDiagnostics(supabase, channelName, channelBaseName),
        });
      });

    return () => {
      active = false;
      if (activeChannelGenerationRef.current === channelGeneration) {
        activeChannelGenerationRef.current += 1;
      }
      hasSubscribedRef.current = false;
      logRealtimeDiagnostic('messaging-global-cleanup-start', {
        owner: 'messaging-global',
        authStatus,
        userId,
        generation: channelGeneration,
        hadChannel: Boolean(channel),
        channelName,
        ...getRealtimeDiagnostics(supabase, channelName, channelBaseName),
      });

      if (channel) {
        const channelToRemove = channel;

        void supabase
          .removeChannel(channelToRemove)
          .then((removeResult) => {
            logRealtimeDiagnostic('messaging-global-cleanup-removed', {
              owner: 'messaging-global',
              authStatus,
              userId,
              generation: channelGeneration,
              removeResult,
              channelName,
              ...getRealtimeDiagnostics(supabase, channelName, channelBaseName),
            });
          })
          .catch((error: unknown) => {
            logRealtimeDiagnostic('messaging-global-cleanup-remove-failed', {
              owner: 'messaging-global',
              authStatus,
              userId,
              generation: channelGeneration,
              channelName,
              error:
                error instanceof Error
                  ? serializeMessagingRealtimeError(error)
                  : { errorMessage: String(error) },
              ...getRealtimeDiagnostics(supabase, channelName, channelBaseName),
            });
          });
      }
    };
  }, [
    authStatus,
    channelReconnectGeneration,
    refreshMessagingStateForUser,
    supabase,
    userId,
  ]);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    function handleOnline(): void {
      if (hasSubscribedRef.current) {
        channelStatusVersionRef.current += 1;
        setChannelStatus({
          userId,
          status: 'reconnecting',
        });
        setChannelReconnectGeneration((generation) => generation + 1);
      }
    }

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [userId]);

  const unreadConversationCount =
    authStatus === 'authenticated' && userId
      ? snapshot.userId === userId
        ? snapshot.unreadConversationCount
        : initialUnreadConversationCount
      : authStatus === 'checking'
        ? initialUnreadConversationCount
        : 0;
  const conversations =
    authStatus === 'authenticated' && userId && snapshot.userId === userId
      ? snapshot.conversations
      : null;
  const status =
    authStatus === 'authenticated' &&
    userId &&
    channelStatus.userId === userId
      ? channelStatus.status
      : 'idle';

  const value = useMemo<MessagingRealtimeContextValue>(
    () => ({
      unreadConversationCount,
      conversations,
      status,
      refreshMessagingState,
    }),
    [conversations, refreshMessagingState, status, unreadConversationCount]
  );

  return (
    <MessagingRealtimeContext.Provider value={value}>
      {children}
    </MessagingRealtimeContext.Provider>
  );
}

export function useMessagingRealtime(): MessagingRealtimeContextValue {
  const context = useContext(MessagingRealtimeContext);

  if (!context) {
    throw new Error(
      'useMessagingRealtime must be used within MessagingRealtimeProvider.'
    );
  }

  return context;
}
